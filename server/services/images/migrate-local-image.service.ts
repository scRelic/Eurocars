import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { processAvatarImage, processCarImage } from "./image-processing.service.ts";
import type { ImageVariant } from "./image-processing.service.ts";
import { lockListingImages } from "./listing-image-state.service.ts";
import { listingImageUrl } from "../../utils/listing-image-storage.ts";

type MimeType = "image/jpeg" | "image/png" | "image/webp";
type Store = {
  uploadImage(pathname: string, data: Buffer, contentType: string, signal?: AbortSignal): Promise<{ pathname: string }>;
  getImageMetadata(pathname: string, signal?: AbortSignal): Promise<{ pathname: string; size: number; contentType: string }>;
};

export const stageLocalImage = async (
  database: Pool, store: Store, userId: string, purpose: "LISTING" | "AVATAR", data: Buffer, mimeType: MimeType,
) => {
  const processed: Record<string, ImageVariant> = purpose === "AVATAR"
    ? { avatar: await processAvatarImage(data, mimeType) }
    : await processCarImage(data, mimeType);
  const id = randomUUID();
  const attempt = randomUUID();
  const originalPath = `temp/${userId}/${id}`;
  const paths = Object.fromEntries(Object.keys(processed).map((name) => [name, `${originalPath}/${attempt}/${name}.webp`]));
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO image_uploads (id, user_id, purpose, temporary_blob_pathname, status, expected_file_size,
         expected_mime_type, expires_at, processing_attempt, processing_started_at, processing_attempts)
       VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6, NOW() + INTERVAL '15 minutes', $7, NOW(), 1)`,
      [id, userId, purpose, originalPath, data.length, mimeType, attempt],
    );
    for (const pathname of Object.values(paths)) {
      await client.query(
        "INSERT INTO image_delete_jobs (store, pathname, next_attempt_at) VALUES ('PRIVATE', $1, NOW() + INTERVAL '1 hour')",
        [pathname],
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
    for (const [name, variant] of Object.entries(processed)) {
      const pathname = paths[name];
      if (!pathname) throw new Error("Missing migration pathname.");
      const saved = await store.uploadImage(pathname, variant.data, variant.mimeType, signal);
      const metadata = await store.getImageMetadata(pathname, signal);
      if (saved.pathname !== pathname || metadata.pathname !== pathname
        || metadata.size !== variant.data.length || metadata.contentType !== variant.mimeType) {
        throw new Error("Migrated image metadata does not match.");
      }
    }
    const finalClient = await database.connect();
    try {
      await finalClient.query("BEGIN");
      const updated = await finalClient.query(
        `UPDATE image_uploads SET status = 'READY', completed_at = NOW(), actual_file_size = $1,
         expires_at = NOW() + INTERVAL '24 hours', processing_attempt = NULL, processing_started_at = NULL
         WHERE id = $2 AND status = 'PROCESSING' AND processing_attempt = $3 AND expires_at > NOW() RETURNING id`,
        [data.length, id, attempt],
      );
      if (!updated.rowCount) throw new Error("Migration session expired.");
      for (const [name, variant] of Object.entries(processed)) {
        await finalClient.query(
          `INSERT INTO image_upload_variants (upload_id, variant, pathname, width, height, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, name, paths[name], variant.width, variant.height, variant.data.length, variant.mimeType],
        );
      }
      await finalClient.query("COMMIT");
    } catch (error) {
      await finalClient.query("ROLLBACK");
      throw error;
    } finally {
      finalClient.release();
    }
    return id;
  } catch (error) {
    await database.query(
      `UPDATE image_uploads SET status = 'FAILED', error_code = 'MIGRATION_ERROR',
       processing_attempt = NULL, processing_started_at = NULL WHERE id = $1 AND processing_attempt = $2`,
      [id, attempt],
    );
    throw error;
  }
};

export const attachMigratedListingImage = async (
  database: Pool, carId: string, imageId: string, userId: string, expectedUrl: string, uploadId: string,
) => {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await lockListingImages(client, carId);
    const car = await client.query("SELECT id FROM cars WHERE id = $1 AND seller_id = $2 FOR UPDATE", [carId, userId]);
    const image = await client.query(
      "SELECT id FROM car_images WHERE id = $1 AND car_id = $2 AND image_url = $3 AND storage_provider = 'LOCAL' FOR UPDATE",
      [imageId, carId, expectedUrl],
    );
    if (!car.rowCount || !image.rowCount) throw new Error("Listing image changed during migration.");
    const consumed = await client.query(
      `UPDATE image_uploads SET consumed_at = NOW() WHERE id = $1 AND user_id = $2 AND purpose = 'LISTING'
       AND status = 'READY' AND consumed_at IS NULL AND expires_at > NOW() RETURNING id`,
      [uploadId, userId],
    );
    if (!consumed.rowCount) throw new Error("Migration upload session is unavailable.");
    const updated = await client.query(
      `UPDATE car_images i SET storage_provider = 'BLOB', upload_id = $1, image_url = $3, width = v.width, height = v.height,
       file_size = v.file_size, mime_type = v.mime_type
       FROM image_upload_variants v WHERE i.id = $2 AND v.upload_id = $1 AND v.variant = 'gallery' RETURNING i.id`,
      [uploadId, imageId, listingImageUrl(carId, imageId)],
    );
    if (!updated.rowCount) throw new Error("Migrated image variant is unavailable.");
    await client.query("INSERT INTO image_sync_jobs (image_id) VALUES ($1) ON CONFLICT DO NOTHING", [imageId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
