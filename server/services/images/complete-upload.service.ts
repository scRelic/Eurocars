import { randomUUID } from "node:crypto";
import type { GetBlobResult } from "@vercel/blob";
import type { Pool } from "pg";
import { ImageValidationError, processAvatarImage, processCarImage } from "./image-processing.service.ts";
import type { ImageVariant } from "./image-processing.service.ts";
import { readUploadedImage } from "./read-uploaded-image.service.ts";
import { UploadSessionError } from "./upload-sessions.service.ts";

type ContentType = "image/jpeg" | "image/png" | "image/webp";
type VariantName = "thumbnail" | "catalog" | "gallery" | "avatar";
type ImageStore = {
  getImage(pathname: string, signal?: AbortSignal): Promise<GetBlobResult | null>;
  uploadImage(pathname: string, data: Buffer, contentType: string, signal?: AbortSignal): Promise<{ pathname: string }>;
  getImageMetadata(pathname: string, signal?: AbortSignal): Promise<{ pathname: string; size: number; contentType: string }>;
};
type Session = {
  status: string;
  purpose: "LISTING" | "AVATAR";
  temporary_blob_pathname: string;
  expected_file_size: string;
  expected_mime_type: ContentType;
  expires_at: Date;
  processing_started_at: Date | null;
  processing_attempts: number;
  consumed_at: Date | null;
  can_reclaim: boolean;
};

export const completeUploadSession = async (database: Pool, store: ImageStore, userId: string, uploadId: string) => {
  const client = await database.connect();
  const attempt = randomUUID();
  let session: Session;
  let paths: Record<VariantName, string>;
  try {
    await client.query("BEGIN");
    const result = await client.query<Session>(
      `SELECT status, purpose, temporary_blob_pathname, expected_file_size::text, expected_mime_type,
              expires_at, processing_started_at, processing_attempts, consumed_at,
              processing_started_at < NOW() - INTERVAL '10 minutes' AS can_reclaim
       FROM image_uploads WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [uploadId, userId],
    );
    const found = result.rows[0];
    if (!found || found.consumed_at || found.expires_at.getTime() <= Date.now()) {
      throw new UploadSessionError("Upload session is unavailable.");
    }
    if (found.status === "READY") {
      const variants = await client.query("SELECT variant, pathname, width, height, file_size::text, mime_type FROM image_upload_variants WHERE upload_id = $1 ORDER BY variant", [uploadId]);
      await client.query("COMMIT");
      return variants.rows;
    }
    if (found.status !== "UPLOADING" && !(found.status === "PROCESSING" && found.can_reclaim)) {
      throw new UploadSessionError("Upload session is not ready for processing.");
    }
    if (found.processing_attempts >= 5) throw new UploadSessionError("Upload processing retry limit reached.");
    session = found;
    const names: VariantName[] = session.purpose === "AVATAR" ? ["avatar"] : ["thumbnail", "catalog", "gallery"];
    const prefix = `temp/${userId}/${uploadId}/${attempt}`;
    paths = {
      thumbnail: `${prefix}/thumbnail.webp`,
      catalog: `${prefix}/catalog.webp`,
      gallery: `${prefix}/gallery.webp`,
      avatar: `${prefix}/avatar.webp`,
    };
    await client.query(
      `UPDATE image_uploads SET status = 'PROCESSING', processing_attempt = $1, processing_started_at = NOW(),
       processing_attempts = processing_attempts + 1, error_code = NULL WHERE id = $2`,
      [attempt, uploadId],
    );
    for (const name of names) {
      await client.query(
        `INSERT INTO image_delete_jobs (store, pathname, next_attempt_at)
         VALUES ('PRIVATE', $1, GREATEST($2::timestamptz, NOW()) + INTERVAL '1 hour')`,
        [paths[name], session.expires_at],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  try {
    const signal = AbortSignal.timeout(25_000);
    const original = await readUploadedImage(
      store, session.temporary_blob_pathname, Number(session.expected_file_size), session.expected_mime_type, signal,
    );
    const processed: Partial<Record<VariantName, ImageVariant>> = session.purpose === "AVATAR"
      ? { avatar: await processAvatarImage(original, session.expected_mime_type) }
      : await processCarImage(original, session.expected_mime_type);
    const names: VariantName[] = session.purpose === "AVATAR" ? ["avatar"] : ["thumbnail", "catalog", "gallery"];
    for (const name of names) {
      const variant = processed[name];
      const pathname = paths[name];
      if (!variant) throw new Error("Missing processed image variant.");
      const uploaded = await store.uploadImage(pathname, variant.data, variant.mimeType, signal);
      if (uploaded.pathname !== pathname) throw new Error("Uploaded variant pathname does not match.");
      const metadata = await store.getImageMetadata(pathname, signal);
      if (metadata.pathname !== pathname || metadata.size !== variant.data.length || metadata.contentType !== variant.mimeType) {
        throw new Error("Uploaded variant metadata does not match.");
      }
    }
    const finalClient = await database.connect();
    try {
      await finalClient.query("BEGIN");
      const updated = await finalClient.query(
        `UPDATE image_uploads SET status = 'READY', completed_at = NOW(), actual_file_size = $1,
          expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
          processing_attempt = NULL, processing_started_at = NULL
         WHERE id = $2 AND user_id = $3 AND status = 'PROCESSING' AND processing_attempt = $4
           AND consumed_at IS NULL AND expires_at > NOW() RETURNING id`,
        [original.length, uploadId, userId, attempt],
      );
      if (!updated.rowCount) throw new UploadSessionError("Upload session is no longer available.");
      for (const name of names) {
        const variant = processed[name];
        const pathname = paths[name];
        if (!variant) throw new Error("Missing processed image variant.");
        await finalClient.query(
          `INSERT INTO image_upload_variants (upload_id, variant, pathname, width, height, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uploadId, name, pathname, variant.width, variant.height, variant.data.length, variant.mimeType],
        );
      }
      const variants = await finalClient.query("SELECT variant, pathname, width, height, file_size::text, mime_type FROM image_upload_variants WHERE upload_id = $1 ORDER BY variant", [uploadId]);
      await finalClient.query("COMMIT");
      return variants.rows;
    } catch (error) {
      await finalClient.query("ROLLBACK");
      throw error;
    } finally {
      finalClient.release();
    }
  } catch (error) {
    await database.query(
      `UPDATE image_uploads SET status = $1, error_code = $2, processing_attempt = NULL, processing_started_at = NULL
       WHERE id = $3 AND user_id = $4 AND status = 'PROCESSING' AND processing_attempt = $5`,
      [error instanceof ImageValidationError ? "FAILED" : "UPLOADING",
        error instanceof ImageValidationError ? "INVALID_IMAGE" : "PROCESSING_ERROR", uploadId, userId, attempt],
    );
    throw error;
  }
};
