import type { PoolClient } from "pg";
import { listingImageUrl } from "../../utils/listing-image-storage.ts";

export const listingBlobEnabled = () => process.env.BLOB_LISTING_ENABLED === "true";
export const listingBlobPath = (carId: string, key: string, variant: string) => `cars/${carId}/${key}/${variant}.webp`;

export const lockListingImages = async (client: PoolClient, carId: string) => {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('listing-image:' || $1, 0))", [carId]);
};

export const queueListingImageDeletion = async (
  client: PoolClient,
  carId: string,
  image: { upload_id: string | null; private_key: string | null; public_key: string | null },
) => {
  for (const [store, key] of [["PRIVATE", image.private_key], ["PUBLIC", image.public_key]] as const) {
    if (!key) continue;
    for (const variant of ["thumbnail", "catalog", "gallery"]) {
      await client.query(
        `INSERT INTO image_delete_jobs (store, pathname) VALUES ($1, $2)
         ON CONFLICT (store, pathname) DO UPDATE SET next_attempt_at = LEAST(image_delete_jobs.next_attempt_at, NOW())`,
        [store, listingBlobPath(carId, key, variant)],
      );
    }
  }
  if (image.upload_id) await client.query("DELETE FROM image_upload_variants WHERE upload_id = $1", [image.upload_id]);
};

export const updateListingImageVisibility = async (client: PoolClient, carId: string, status: string) => {
  const result = await client.query<{ id: string; public_key: string | null }>(
    `SELECT id::text, to_jsonb(car_images)->>'public_key' AS public_key FROM car_images
     WHERE car_id = $1 AND to_jsonb(car_images)->>'storage_provider' = 'BLOB' FOR UPDATE`,
    [carId],
  );
  for (const image of result.rows) {
    if (status !== "ACTIVE" && image.public_key) {
      for (const variant of ["thumbnail", "catalog", "gallery"]) {
        await client.query(
          `INSERT INTO image_delete_jobs (store, pathname) VALUES ('PUBLIC', $1)
           ON CONFLICT (store, pathname) DO UPDATE SET next_attempt_at = LEAST(image_delete_jobs.next_attempt_at, NOW())`,
          [listingBlobPath(carId, image.public_key, variant)],
        );
      }
      await client.query(
        `UPDATE car_images SET image_url = $1, public_key = NULL, thumbnail_url = NULL, catalog_url = NULL, gallery_url = NULL
         WHERE id = $2`,
        [listingImageUrl(carId, image.id), image.id],
      );
    }
    await client.query(
      `INSERT INTO image_sync_jobs (image_id) VALUES ($1)
       ON CONFLICT (image_id) DO UPDATE SET next_attempt_at = NOW(), attempts = 0`,
      [image.id],
    );
  }
};
