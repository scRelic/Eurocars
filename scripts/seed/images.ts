import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Pool } from "pg";
import { readBoundedFile } from "../../server/utils/bounded-file.ts";
import { getImageConfig } from "../../server/services/images/image-config.ts";
import { processCarImage } from "../../server/services/images/image-processing.service.ts";
import { stageLocalImage } from "../../server/services/images/migrate-local-image.service.ts";
import { syncListingImage } from "../../server/services/images/sync-listing-image.service.ts";
import { lockListingImages } from "../../server/services/images/listing-image-state.service.ts";
import { VercelBlobStore } from "../../server/services/storage/vercel-blob.service.ts";
import { imageType } from "../../server/utils/image-signature.ts";
import { register, registryId, safeError } from "./common.ts";
import type { Counts } from "./common.ts";

const imageSourceSchema = z.object({
  vehicleKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  file: z.string().min(1),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  author: z.string().trim().min(1),
  license: z.string().trim().min(1),
  licenseUrl: z.url({ protocol: /^https?$/ }),
}).strict();

export type DemoImageSource = z.infer<typeof imageSourceSchema>;

export const validateImageSources = (input: unknown, vehicleKeys: ReadonlySet<string>) => {
  const sources = z.array(imageSourceSchema).parse(input);
  const paths = new Set<string>();
  const counts = new Map<string, number>();
  for (const source of sources) {
    if (!vehicleKeys.has(source.vehicleKey)) throw new Error(`Unknown vehicle key: ${source.vehicleKey}`);
    if (paths.has(source.file)) throw new Error(`Duplicate image file: ${source.file}`);
    if (isAbsolute(source.file) || source.file.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) {
      throw new Error("Image file must be a relative path inside seed-images.");
    }
    paths.add(source.file);
    const count = (counts.get(source.vehicleKey) ?? 0) + 1;
    if (count > 5) throw new Error(`More than five photos for ${source.vehicleKey}.`);
    counts.set(source.vehicleKey, count);
  }
  return sources;
};

export const missingImageCounts = (vehicleKeys: Iterable<string>, sources: DemoImageSource[]) => {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.vehicleKey, (counts.get(source.vehicleKey) ?? 0) + 1);
  return [...vehicleKeys].map((key) => ({ key, count: counts.get(key) ?? 0 }))
    .filter(({ count }) => count < 3)
    .map(({ key, count }) => ({ key, available: count, missing: 3 - count }));
};

export const prepareDemoImage = async (source: DemoImageSource) => {
  const root = await realpath(fileURLToPath(new URL("../../seed-images/", import.meta.url)));
  const path = await realpath(resolve(root, source.file));
  const inside = relative(root, path);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error("Image path leaves seed-images.");
  }
  const input = await readBoundedFile(path, getImageConfig().maxFileMb * 1024 * 1024);
  const mimeType = imageType(input);
  if (!mimeType) throw new Error("Unsupported image format.");
  const variants = await processCarImage(input);
  return {
    input,
    mimeType,
    sha256: createHash("sha256").update(input).digest("hex"),
    variants,
    sourceBytes: input.length,
    optimizedBytes: variants.thumbnail.data.length + variants.catalog.data.length + variants.gallery.data.length,
  };
};

export const seedImages = async (
  database: Pool,
  sources: DemoImageSource[],
  stores: { privateStore: VercelBlobStore; publicStore: VercelBlobStore },
  storeIds: { privateId: string; publicId: string },
  counts: Counts,
) => {
  for (const source of sources) {
    const key = `${source.vehicleKey}:${source.file}`;
    try {
      const prepared = await prepareDemoImage(source);
      const lookup = await database.connect();
      let carId: string;
      let sellerId: string;
      let existingImage: string | null;
      try {
        const foundCar = await registryId(lookup, "car", source.vehicleKey);
        if (!foundCar) throw new Error("Demo listing is missing.");
        const car = await lookup.query<{ seller_id: string }>(
          `SELECT c.seller_id::text FROM cars c
           JOIN eurocars_demo_seed_registry r ON r.kind='car' AND r.entity_id=c.id
           WHERE c.id=$1 AND c.title=r.metadata->>'title' AND c.description=r.metadata->>'description'
             AND c.seller_id::text=r.metadata->>'sellerId' AND c.updated_at=c.created_at`,
          [foundCar],
        );
        if (!car.rows[0]) throw new Error("Demo listing was modified.");
        carId = foundCar;
        sellerId = car.rows[0].seller_id;
        existingImage = await registryId(lookup, "image", key);
        if (existingImage) {
          const exists = await lookup.query(
            `SELECT i.id FROM car_images i JOIN eurocars_demo_seed_registry r ON r.kind='image' AND r.entity_id=i.id
             WHERE i.id=$1 AND i.car_id=$2 AND r.metadata->>'privateStoreId'=$3 AND r.metadata->>'publicStoreId'=$4
               AND r.metadata->>'sha256'=$5`,
            [existingImage, carId, storeIds.privateId, storeIds.publicId, prepared.sha256],
          );
          if (!exists.rowCount) throw new Error("Registered demo image changed.");
        } else {
          const duplicate = await lookup.query(
            `SELECT entity_id FROM eurocars_demo_seed_registry WHERE kind='image'
             AND metadata->>'carId'=$1 AND metadata->>'sha256'=$2`,
            [carId, prepared.sha256],
          );
          if (duplicate.rowCount) {
            counts.skipped++;
            continue;
          }
        }
      } finally {
        lookup.release();
      }

      if (existingImage) {
        counts.skipped++;
        const job = await database.query<{ due: boolean }>(
          "SELECT next_attempt_at<=NOW() AS due FROM image_sync_jobs WHERE image_id=$1", [existingImage],
        );
        if (job.rows[0]) {
          if (!job.rows[0].due) throw new Error("Image synchronization remains pending; retry after backoff.");
          await syncListingImage(database, stores.privateStore, stores.publicStore, existingImage);
          const pending = await database.query("SELECT 1 FROM image_sync_jobs WHERE image_id=$1", [existingImage]);
          if (pending.rowCount) throw new Error("Image synchronization remains pending; retry later.");
        }
        continue;
      }

      const uploadId = await stageLocalImage(database, stores.privateStore, sellerId, "LISTING", prepared.input, prepared.mimeType);
      counts.storedBytes += prepared.optimizedBytes;
      const client = await database.connect();
      let imageId: string;
      try {
        await client.query("BEGIN");
        await lockListingImages(client, carId);
        const car = await client.query(
          `SELECT c.id FROM cars c JOIN eurocars_demo_seed_registry r ON r.kind='car' AND r.entity_id=c.id
           WHERE c.id=$1 AND c.seller_id=$2 AND c.title=r.metadata->>'title' AND c.description=r.metadata->>'description'
             AND c.seller_id::text=r.metadata->>'sellerId' AND c.updated_at=c.created_at
           FOR UPDATE OF c`,
          [carId, sellerId],
        );
        if (!car.rowCount) throw new Error("Demo listing was modified.");
        const consumed = await client.query(
          `UPDATE image_uploads SET consumed_at=NOW() WHERE id=$1 AND user_id=$2 AND status='READY'
           AND consumed_at IS NULL AND expires_at>NOW() RETURNING id`,
          [uploadId, sellerId],
        );
        if (!consumed.rowCount) throw new Error("Demo image session is unavailable.");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO car_images(car_id,image_url,position,is_primary,storage_provider,upload_id,width,height,file_size,mime_type)
           SELECT $1,'',COALESCE((SELECT MAX(position)+1 FROM car_images WHERE car_id=$1),0),
             NOT EXISTS(SELECT 1 FROM car_images WHERE car_id=$1 AND is_primary), 'BLOB',$2,v.width,v.height,v.file_size,v.mime_type
           FROM image_upload_variants v WHERE v.upload_id=$2 AND v.variant='gallery' RETURNING id::text`,
          [carId, uploadId],
        );
        const id = inserted.rows[0]?.id;
        if (!id) throw new Error("Processed demo image is unavailable.");
        imageId = id;
        await client.query("UPDATE car_images SET image_url=$1 WHERE id=$2", [`/api/cars/${carId}/images/${id}`, id]);
        await client.query("INSERT INTO image_sync_jobs(image_id) VALUES ($1)", [id]);
        await register(client, "image", key, id, { ...source, carId, uploadId, sha256: prepared.sha256, privateStoreId: storeIds.privateId, publicStoreId: storeIds.publicId });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      counts.images++;
      counts.originalBytes += prepared.sourceBytes;
      counts.optimizedBytes += prepared.optimizedBytes;
      await syncListingImage(database, stores.privateStore, stores.publicStore, imageId);
      const pending = await database.query("SELECT 1 FROM image_sync_jobs WHERE image_id=$1", [imageId]);
      if (pending.rowCount) throw new Error("Image synchronization remains pending.");
      const state = await database.query<{ status: string }>("SELECT status FROM cars WHERE id=$1", [carId]);
      counts.storedBytes += prepared.optimizedBytes * (state.rows[0]?.status === "ACTIVE" ? 2 : 1);
    } catch (error) {
      counts.failedImages++;
      counts.errors.push(`Image ${key}: ${safeError(error)}`);
    }
  }
};
