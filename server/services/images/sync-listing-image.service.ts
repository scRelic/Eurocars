import { randomUUID } from "node:crypto";
import type { GetBlobResult } from "@vercel/blob";
import type { Pool } from "pg";
import { readUploadedImage } from "./read-uploaded-image.service.ts";
import { listingBlobPath, lockListingImages } from "./listing-image-state.service.ts";

type Store = {
  getImage(pathname: string, signal?: AbortSignal): Promise<GetBlobResult | null>;
  uploadImage(pathname: string, data: Buffer, contentType: string, signal?: AbortSignal): Promise<{ pathname: string; url: string }>;
  getImageMetadata(pathname: string, signal?: AbortSignal): Promise<{ pathname: string; size: number; contentType: string }>;
};
type PublicStore = Store & { ownsPublicUrl(url: string, pathname: string): boolean };
type ImageRow = { car_id: string; upload_id: string; private_key: string | null; public_key: string | null; status: string };
type Variant = { variant: string; pathname: string; file_size: string; mime_type: string };
const variants = ["thumbnail", "catalog", "gallery"] as const;
type VariantName = typeof variants[number];

export const syncListingImage = async (database: Pool, privateStore: Store, publicStore: PublicStore, imageId: string) => {
  const planClient = await database.connect();
  const privateKey = randomUUID();
  const publicKey = randomUUID();
  let plan: ImageRow;
  try {
    await planClient.query("BEGIN");
    const result = await planClient.query<ImageRow>(
      `SELECT i.car_id::text, i.upload_id::text, i.private_key::text, i.public_key::text, c.status
       FROM image_sync_jobs j JOIN car_images i ON i.id = j.image_id JOIN cars c ON c.id = i.car_id
       WHERE i.id = $1 AND i.storage_provider = 'BLOB' AND j.next_attempt_at <= NOW()`,
      [imageId],
    );
    const found = result.rows[0];
    if (!found) {
      await planClient.query("COMMIT");
      return false;
    }
    plan = found;
    for (const [store, key, needed] of [
      ["PRIVATE", privateKey, !plan.private_key],
      ["PUBLIC", publicKey, plan.status === "ACTIVE" && !plan.public_key],
    ] as const) {
      if (!needed) continue;
      for (const name of variants) {
        await planClient.query(
          `INSERT INTO image_delete_jobs (store, pathname, next_attempt_at)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
          [store, listingBlobPath(plan.car_id, key, name)],
        );
      }
    }
    await planClient.query("COMMIT");
  } catch (error) {
    await planClient.query("ROLLBACK");
    throw error;
  } finally {
    planClient.release();
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await lockListingImages(client, plan.car_id);
    const car = await client.query<{ status: string }>("SELECT status FROM cars WHERE id = $1 FOR UPDATE", [plan.car_id]);
    const found = await client.query<ImageRow>(
      `SELECT i.car_id::text, i.upload_id::text, i.private_key::text, i.public_key::text, $2::text AS status
       FROM car_images i JOIN image_sync_jobs j ON j.image_id = i.id
       WHERE i.id = $1 AND i.storage_provider = 'BLOB' FOR UPDATE OF i, j`,
      [imageId, car.rows[0]?.status ?? ""],
    );
    const image = found.rows[0];
    if (!car.rows[0] || !image) {
      await client.query("COMMIT");
      return false;
    }
    const signal = AbortSignal.timeout(25_000);
    let activePrivateKey = image.private_key;
    if (!activePrivateKey && !plan.private_key) {
      const source = await client.query<Variant>(
        `SELECT variant, pathname, file_size::text, mime_type FROM image_upload_variants
         WHERE upload_id = $1 AND variant IN ('thumbnail', 'catalog', 'gallery')`,
        [image.upload_id],
      );
      if (source.rows.length !== variants.length) throw new Error("Listing image variants are unavailable.");
      for (const name of variants) {
        const variant = source.rows.find((row) => row.variant === name);
        if (!variant) throw new Error("Listing image variant is unavailable.");
        const data = await readUploadedImage(privateStore, variant.pathname, Number(variant.file_size), variant.mime_type, signal);
        const destination = listingBlobPath(image.car_id, privateKey, name);
        const saved = await privateStore.uploadImage(destination, data, "image/webp", signal);
        const metadata = await privateStore.getImageMetadata(destination, signal);
        if (saved.pathname !== destination || metadata.pathname !== destination || metadata.size !== data.length || metadata.contentType !== "image/webp") {
          throw new Error("Private listing image verification failed.");
        }
      }
      await client.query("UPDATE car_images SET private_key = $1 WHERE id = $2", [privateKey, imageId]);
      await client.query("DELETE FROM image_upload_variants WHERE upload_id = $1", [image.upload_id]);
      activePrivateKey = privateKey;
    }
    if (image.status !== "ACTIVE" && image.public_key) throw new Error("Inactive listing has a public image reference.");
    if (image.status === "ACTIVE" && !image.public_key && activePrivateKey && plan.status === "ACTIVE" && !plan.public_key) {
      const urls: Partial<Record<VariantName, string>> = {};
      for (const name of variants) {
        const source = listingBlobPath(image.car_id, activePrivateKey, name);
        const sourceMetadata = await privateStore.getImageMetadata(source, signal);
        if (sourceMetadata.pathname !== source || sourceMetadata.contentType !== "image/webp") throw new Error("Private listing image metadata is invalid.");
        const data = await readUploadedImage(privateStore, source, sourceMetadata.size, sourceMetadata.contentType, signal);
        const destination = listingBlobPath(image.car_id, publicKey, name);
        const saved = await publicStore.uploadImage(destination, data, "image/webp", signal);
        const metadata = await publicStore.getImageMetadata(destination, signal);
        if (saved.pathname !== destination || !publicStore.ownsPublicUrl(saved.url, destination)
          || metadata.pathname !== destination || metadata.size !== data.length || metadata.contentType !== "image/webp") {
          throw new Error("Public listing image verification failed.");
        }
        urls[name] = saved.url;
      }
      if (!urls.thumbnail || !urls.catalog || !urls.gallery) throw new Error("Public listing image URLs are unavailable.");
      await client.query(
        `UPDATE car_images SET public_key = $1, thumbnail_url = $2, catalog_url = $3, gallery_url = $4, image_url = $3
         WHERE id = $5`,
        [publicKey, urls.thumbnail, urls.catalog, urls.gallery, imageId],
      );
      image.public_key = publicKey;
    }
    if (activePrivateKey && (image.status !== "ACTIVE" || image.public_key)) {
      await client.query("DELETE FROM image_sync_jobs WHERE image_id = $1", [imageId]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    await client.query(
      `UPDATE image_sync_jobs SET attempts = attempts + 1, last_error_at = NOW(),
       next_attempt_at = NOW() + LEAST(INTERVAL '24 hours', INTERVAL '1 minute' * POWER(2, LEAST(attempts, 10)))
       WHERE image_id = $1`,
      [imageId],
    );
    throw error;
  } finally {
    client.release();
  }
};
