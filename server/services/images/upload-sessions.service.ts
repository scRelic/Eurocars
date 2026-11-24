import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getImageConfig } from "./image-config.ts";

type UploadPurpose = "LISTING" | "AVATAR";
type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

export class UploadSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadSessionError";
  }
}

export const prepareUploadSession = async (
  database: Pool,
  userId: string,
  purpose: UploadPurpose,
  expectedSize: number,
  contentType: ImageContentType,
) => {
  if (!/^[1-9]\d{0,18}$/.test(userId) || BigInt(userId) > 9223372036854775807n) {
    throw new UploadSessionError("Invalid user ID.");
  }
  if (!["LISTING", "AVATAR"].includes(purpose)
    || !["image/jpeg", "image/png", "image/webp"].includes(contentType)
    || !Number.isSafeInteger(expectedSize) || expectedSize <= 0
    || expectedSize > (purpose === "AVATAR" ? 5 : getImageConfig().maxFileMb) * 1024 * 1024) {
    throw new UploadSessionError("Invalid image upload details.");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('image_upload:' || $1, 0))", [userId]);
    const result = await client.query<{ outstanding: number; recent: number }>(
      `SELECT COUNT(*) FILTER (WHERE consumed_at IS NULL AND expires_at > NOW()
          AND status IN ('PENDING','UPLOADING','PROCESSING','READY'))::int AS outstanding,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS recent
       FROM image_uploads WHERE user_id = $1`,
      [userId],
    );
    const counts = result.rows[0];
    if (!counts) throw new Error("Unable to read image upload quota.");
    if (counts.outstanding >= 20 || counts.recent >= 60) {
      throw new UploadSessionError("Upload limit reached. Please try again later.");
    }
    const id = randomUUID();
    const pathname = `temp/${userId}/${id}`;
    const saved = await client.query<{ expires_at: Date }>(
      `INSERT INTO image_uploads
        (id, user_id, purpose, temporary_blob_pathname, expected_file_size, expected_mime_type, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')
       RETURNING expires_at`,
      [id, userId, purpose, pathname, expectedSize, contentType],
    );
    const row = saved.rows[0];
    if (!row) throw new Error("Unable to create image upload session.");
    await client.query(
      `INSERT INTO image_delete_jobs (store, pathname, next_attempt_at)
       VALUES ('PRIVATE', $1, $2::timestamptz + INTERVAL '5 minutes')`,
      [pathname, row.expires_at],
    );
    await client.query("COMMIT");
    return { id, pathname, expiresAt: row.expires_at };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
