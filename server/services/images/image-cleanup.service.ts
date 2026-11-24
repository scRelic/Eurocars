import type { Pool } from "pg";

type DeleteStore = { deleteImages(pathnames: string[]): Promise<void> };
type CleanupResult = { store: "PUBLIC" | "PRIVATE"; pathname: string; outcome: "would-delete" | "deleted" | "protected" | "failed" };

export const cleanupTemporaryImages = async (
  database: Pool,
  store: DeleteStore,
  options: { limit: number; dryRun: boolean; publicStore?: DeleteStore },
): Promise<CleanupResult[]> => {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 500) {
    throw new Error("Cleanup batch size must be between 1 and 500.");
  }
  const results: CleanupResult[] = [];
  const visited: string[] = [];
  for (let i = 0; i < options.limit; i++) {
    const candidate = await database.query<{ id: string; store: "PUBLIC" | "PRIVATE"; pathname: string }>(
      `SELECT id::text, store, pathname FROM image_delete_jobs
       WHERE ((store = 'PRIVATE' AND pathname LIKE 'temp/%')
         OR ($2::boolean AND store = 'PUBLIC' AND pathname LIKE 'avatars/%')) AND next_attempt_at <= NOW()
         AND NOT (id = ANY($1::bigint[]))
       ORDER BY next_attempt_at, id LIMIT 1`,
      [visited, !!options.publicStore],
    );
    const job = candidate.rows[0];
    if (!job) break;
    visited.push(job.id);
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      if (job.store === "PUBLIC") await client.query("SELECT pg_advisory_xact_lock(hashtextextended('avatar-reference', 0))");
      const selected = await client.query(
        "SELECT id FROM image_delete_jobs WHERE id = $1 AND next_attempt_at <= NOW() FOR UPDATE SKIP LOCKED",
        [job.id],
      );
      if (!selected.rowCount) {
        await client.query("COMMIT");
        continue;
      }
      const referenced = job.store === "PRIVATE" ? await client.query<{ id: string; status: string; expires_at: Date; consumed_at: Date | null; is_original: boolean; stale_processing: boolean }>(
        `SELECT u.id::text, u.status, u.expires_at, u.consumed_at, (u.temporary_blob_pathname = $1) AS is_original,
                (u.expires_at <= NOW() AND u.processing_started_at < NOW() - INTERVAL '1 hour') AS stale_processing
         FROM image_uploads u
         WHERE u.temporary_blob_pathname = $1
            OR EXISTS (SELECT 1 FROM image_upload_variants v WHERE v.upload_id = u.id AND v.pathname = $1)
            OR ($1 LIKE u.temporary_blob_pathname || '/%' AND u.status = 'PROCESSING')
         FOR UPDATE`,
        [job.pathname],
      ) : null;
      for (const row of referenced?.rows ?? []) {
        if (row.status === "PROCESSING" && row.stale_processing) {
          if (!options.dryRun) await client.query("UPDATE image_uploads SET status = 'EXPIRED', error_code = 'PROCESSING_TIMEOUT' WHERE id = $1", [row.id]);
          row.status = "EXPIRED";
        }
      }
      const publicReferences = job.store === "PUBLIC" ? await client.query(
        `SELECT id FROM users WHERE avatar_url IS NOT NULL
          AND RIGHT(split_part(avatar_url, '?', 1), LENGTH($1) + 1) = '/' || $1 FOR UPDATE`,
        [job.pathname],
      ) : null;
      const listingReferences = job.store === "PUBLIC" ? await client.query(
        `SELECT id FROM car_images WHERE EXISTS (
           SELECT 1 FROM unnest(ARRAY[image_url, to_jsonb(car_images)->>'thumbnail_url',
             to_jsonb(car_images)->>'catalog_url', to_jsonb(car_images)->>'gallery_url']) AS url
           WHERE url IS NOT NULL AND RIGHT(split_part(url, '?', 1), LENGTH($1) + 1) = '/' || $1
         ) FOR UPDATE`,
        [job.pathname],
      ) : null;
      const protectedObject = !!publicReferences?.rowCount || !!listingReferences?.rowCount || !!referenced?.rows.some((row) =>
        row.status === "PROCESSING"
        || (row.is_original && ["PENDING", "UPLOADING"].includes(row.status) && row.expires_at.getTime() > Date.now())
        || (!row.is_original && row.status === "READY" && (row.consumed_at !== null || row.expires_at.getTime() > Date.now())));
      if (protectedObject) {
        if (!options.dryRun) await client.query("UPDATE image_delete_jobs SET next_attempt_at = NOW() + INTERVAL '1 hour' WHERE id = $1", [job.id]);
        await client.query("COMMIT");
        results.push({ store: job.store, pathname: job.pathname, outcome: "protected" });
        continue;
      }
      if (options.dryRun) {
        await client.query("COMMIT");
        results.push({ store: job.store, pathname: job.pathname, outcome: "would-delete" });
        continue;
      }
      try {
        const selectedStore = job.store === "PRIVATE" ? store : options.publicStore;
        if (!selectedStore) throw new Error("Public store is unavailable.");
        await selectedStore.deleteImages([job.pathname]);
      } catch {
        await client.query(
          `UPDATE image_delete_jobs SET attempts = attempts + 1, last_error_at = NOW(),
           next_attempt_at = NOW() + LEAST(INTERVAL '24 hours', INTERVAL '1 minute' * POWER(2, LEAST(attempts, 10)))
           WHERE id = $1`,
          [job.id],
        );
        await client.query("COMMIT");
        results.push({ store: job.store, pathname: job.pathname, outcome: "failed" });
        continue;
      }
      await client.query("DELETE FROM image_delete_jobs WHERE id = $1", [job.id]);
      await client.query("COMMIT");
      results.push({ store: job.store, pathname: job.pathname, outcome: "deleted" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return results;
};
