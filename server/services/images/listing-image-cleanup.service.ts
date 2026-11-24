import type { Pool } from "pg";
import { lockListingImages } from "./listing-image-state.service.ts";

type Store = { deleteImages(pathnames: string[]): Promise<void> };
type Result = { store: "PUBLIC" | "PRIVATE"; pathname: string; outcome: "would-delete" | "deleted" | "protected" | "failed" };

export const cleanupListingImages = async (
  database: Pool,
  stores: { privateStore: Store; publicStore: Store },
  options: { limit: number; dryRun: boolean },
): Promise<Result[]> => {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 500) throw new Error("Invalid cleanup batch size.");
  const results: Result[] = [];
  const visited: string[] = [];
  for (let i = 0; i < options.limit; i++) {
    const candidate = await database.query<{ id: string; pathname: string; store: "PUBLIC" | "PRIVATE" }>(
      `SELECT id::text, pathname, store FROM image_delete_jobs
       WHERE pathname LIKE 'cars/%' AND next_attempt_at <= NOW() AND NOT (id = ANY($1::bigint[]))
       ORDER BY next_attempt_at, id LIMIT 1`,
      [visited],
    );
    const job = candidate.rows[0];
    if (!job) break;
    visited.push(job.id);
    const match = /^cars\/([1-9]\d{0,18})\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(thumbnail|catalog|gallery)\.webp$/.exec(job.pathname);
    if (!match || BigInt(match[1]!) > 9223372036854775807n) throw new Error("Invalid listing image deletion job.");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      if (job.store === "PUBLIC") await client.query("SELECT pg_advisory_xact_lock(hashtextextended('avatar-reference', 0))");
      await lockListingImages(client, match[1]!);
      const locked = await client.query(
        "SELECT id FROM image_delete_jobs WHERE id = $1 AND next_attempt_at <= NOW() FOR UPDATE SKIP LOCKED",
        [job.id],
      );
      if (!locked.rowCount) {
        await client.query("COMMIT");
        continue;
      }
      const references = await client.query(
        `SELECT id FROM car_images WHERE car_id = $1 AND
         (($2::text = 'PRIVATE' AND to_jsonb(car_images)->>'private_key' = $3)
           OR ($2::text = 'PUBLIC' AND to_jsonb(car_images)->>'public_key' = $3)) FOR UPDATE`,
        [match[1], job.store, match[2]],
      );
      const avatarReferences = job.store === "PUBLIC" ? await client.query(
        `SELECT id FROM users WHERE avatar_url IS NOT NULL
         AND RIGHT(split_part(avatar_url, '?', 1), LENGTH($1) + 1) = '/' || $1 FOR UPDATE`,
        [job.pathname],
      ) : null;
      const urlReferences = job.store === "PUBLIC" ? await client.query(
        `SELECT id FROM car_images WHERE EXISTS (
           SELECT 1 FROM unnest(ARRAY[image_url, to_jsonb(car_images)->>'thumbnail_url',
             to_jsonb(car_images)->>'catalog_url', to_jsonb(car_images)->>'gallery_url']) AS url
           WHERE url IS NOT NULL AND RIGHT(split_part(url, '?', 1), LENGTH($1) + 1) = '/' || $1
         ) FOR UPDATE`,
        [job.pathname],
      ) : null;
      if (references.rowCount || avatarReferences?.rowCount || urlReferences?.rowCount) {
        if (!options.dryRun) await client.query("UPDATE image_delete_jobs SET next_attempt_at = NOW() + INTERVAL '24 hours' WHERE id = $1", [job.id]);
        await client.query("COMMIT");
        results.push({ ...job, outcome: "protected" });
        continue;
      }
      if (options.dryRun) {
        await client.query("COMMIT");
        results.push({ ...job, outcome: "would-delete" });
        continue;
      }
      try {
        await (job.store === "PRIVATE" ? stores.privateStore : stores.publicStore).deleteImages([job.pathname]);
      } catch {
        await client.query(
          `UPDATE image_delete_jobs SET attempts = attempts + 1, last_error_at = NOW(),
           next_attempt_at = NOW() + LEAST(INTERVAL '24 hours', INTERVAL '1 minute' * POWER(2, LEAST(attempts, 10)))
           WHERE id = $1`,
          [job.id],
        );
        await client.query("COMMIT");
        results.push({ ...job, outcome: "failed" });
        continue;
      }
      await client.query("DELETE FROM image_delete_jobs WHERE id = $1", [job.id]);
      await client.query("COMMIT");
      results.push({ ...job, outcome: "deleted" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return results;
};
