import type { Pool, PoolClient } from "pg";
import type { ListingInput, ListingStatus } from "../../shared/types/listing";
import { createListing, getOwnListing, updateListing, validateReferences } from "../repositories/listings";
import type { ListingImageOrderItem, ListingPhotoUpload } from "../utils/listing-image-upload";
import { isListingImageUrl, listingImageUrl, removeListingImageFile, saveListingImage } from "../utils/listing-image-storage";
import { listingBlobEnabled, lockListingImages, queueListingImageDeletion, updateListingImageVisibility } from "./images/listing-image-state.service";
import { getImageConfig } from "./images/image-config";

type ListingImageRow = {
  id: string; image_url: string; is_primary: boolean; storage_provider: "LOCAL" | "BLOB";
  upload_id: string | null; private_key: string | null; public_key: string | null;
};

const syncListingImages = async (
  client: PoolClient,
  userId: string,
  carId: string,
  photos: ListingPhotoUpload[],
  requestedOrder?: ListingImageOrderItem[],
) => {
  const result = await client.query<ListingImageRow>(
    `SELECT id::text, image_url, is_primary, COALESCE(to_jsonb(car_images)->>'storage_provider', 'LOCAL') AS storage_provider,
      to_jsonb(car_images)->>'upload_id' AS upload_id, to_jsonb(car_images)->>'private_key' AS private_key,
      to_jsonb(car_images)->>'public_key' AS public_key
     FROM car_images WHERE car_id = $1 ORDER BY position, id FOR UPDATE`,
    [carId],
  );
  const existing = result.rows;
  const order = requestedOrder ?? [
    ...existing.map((image) => ({ kind: "existing" as const, id: image.id, isPrimary: image.is_primary })),
    ...photos.map((_, index) => ({ kind: "upload" as const, index, isPrimary: existing.length === 0 && index === 0 })),
  ];
  const existingById = new Map(existing.map((image) => [image.id, image]));
  const seenExisting = new Set<string>();
  const seenUploads = new Set<number>();
  const seenPrepared = new Set<string>();
  const primaryCount = order.filter((image) => image.isPrimary).length;
  const maxImages = listingBlobEnabled() ? Math.max(existing.length, getImageConfig().maxCount)
    : existing.some((image) => image.storage_provider === "BLOB") ? 20 : 10;
  if (primaryCount > 1 || order.length > maxImages) {
    throw createError({ statusCode: 400, statusMessage: "Check the selected photos and their order." });
  }
  for (const image of order) {
    if (image.kind === "existing") {
      if (!existingById.has(image.id) || seenExisting.has(image.id)) {
        throw createError({ statusCode: 400, statusMessage: "A selected photo does not belong to this listing." });
      }
      seenExisting.add(image.id);
    } else if (image.kind === "upload") {
      if (image.index >= photos.length || seenUploads.has(image.index)) {
        throw createError({ statusCode: 400, statusMessage: "Check the selected photos and their order." });
      }
      seenUploads.add(image.index);
    } else {
      if (!listingBlobEnabled() || seenPrepared.has(image.id)) {
        throw createError({ statusCode: 400, statusMessage: "Check the selected photos and their order." });
      }
      seenPrepared.add(image.id);
    }
  }
  if (seenUploads.size !== photos.length) {
    throw createError({ statusCode: 400, statusMessage: "All uploaded photos must be included in the photo order." });
  }
  const orderedImages = order.length && primaryCount === 0
    ? order.map((image, index) => ({ ...image, isPrimary: index === 0 }))
    : order;

  const removedFiles = existing
    .filter((image) => image.storage_provider === "LOCAL" && !seenExisting.has(image.id) && isListingImageUrl(image.image_url, carId, image.id))
    .map((image) => image.id);
  const createdFiles: string[] = [];
  try {
    for (const image of existing) {
      if (image.storage_provider === "BLOB" && !seenExisting.has(image.id)) {
        await queueListingImageDeletion(client, carId, image);
      }
    }
    await client.query("UPDATE car_images SET is_primary = FALSE WHERE car_id = $1", [carId]);
    if (seenExisting.size !== existing.length) {
      const retained = [...seenExisting];
      if (retained.length) {
        await client.query("DELETE FROM car_images WHERE car_id = $1 AND NOT (id = ANY($2::bigint[]))", [carId, retained]);
      } else {
        await client.query("DELETE FROM car_images WHERE car_id = $1", [carId]);
      }
    }

    for (const [position, image] of orderedImages.entries()) {
      let id: string;
      if (image.kind === "existing") {
        id = image.id;
        await client.query("UPDATE car_images SET position = $1 WHERE car_id = $2 AND id = $3", [position, carId, id]);
      } else if (image.kind === "upload") {
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO car_images (car_id, image_url, position, is_primary) VALUES ($1, '', $2, FALSE) RETURNING id::text",
          [carId, position],
        );
        id = inserted.rows[0]!.id;
        await client.query("UPDATE car_images SET image_url = $1 WHERE id = $2 AND car_id = $3", [listingImageUrl(carId, id), id, carId]);
        createdFiles.push(id);
        await saveListingImage(carId, id, photos[image.index]!);
      } else {
        const upload = await client.query<{ id: string }>(
          `UPDATE image_uploads SET consumed_at = NOW()
           WHERE id = $1 AND user_id = $2 AND purpose = 'LISTING' AND status = 'READY'
             AND consumed_at IS NULL AND expires_at > NOW()
             AND (SELECT COUNT(*) FROM image_upload_variants WHERE upload_id = image_uploads.id
                  AND variant IN ('thumbnail', 'catalog', 'gallery')) = 3
           RETURNING id::text`,
          [image.id, userId],
        );
        if (!upload.rowCount) throw createError({ statusCode: 409, statusMessage: "A photo is unavailable or has already been used." });
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO car_images (car_id, image_url, position, is_primary, storage_provider, upload_id, width, height, file_size, mime_type)
           SELECT $1, '', $2, FALSE, 'BLOB', $3, width, height, file_size, mime_type
           FROM image_upload_variants WHERE upload_id = $3 AND variant = 'gallery' RETURNING id::text`,
          [carId, position, image.id],
        );
        const insertedImage = inserted.rows[0];
        if (!insertedImage) throw createError({ statusCode: 409, statusMessage: "A processed photo is unavailable." });
        id = insertedImage.id;
        await client.query("UPDATE car_images SET image_url = $1 WHERE id = $2", [listingImageUrl(carId, id), id]);
        await client.query("INSERT INTO image_sync_jobs (image_id) VALUES ($1)", [id]);
      }
      if (image.isPrimary) {
        await client.query("UPDATE car_images SET is_primary = TRUE WHERE car_id = $1 AND id = $2", [carId, id]);
      }
    }
  } catch (error) {
    for (const id of createdFiles) {
      try {
        await removeListingImageFile(carId, id);
      } catch (cleanupError) {
        console.error("Unable to clean up an incomplete listing photo.", cleanupError);
      }
    }
    throw error;
  }
  return removedFiles;
};

const removeListingImages = async (carId: string, imageIds: string[]) => {
  for (const id of imageIds) {
    try {
      await removeListingImageFile(carId, id);
    } catch (error) {
      console.error("Unable to remove an unreferenced listing photo.", error);
    }
  }
};

export const addListing = async (
  database: Pool,
  userId: string,
  listing: ListingInput,
  status: "DRAFT" | "PENDING",
  idempotencyKey: string,
  photos: ListingPhotoUpload[],
  imageOrder?: ListingImageOrderItem[],
) => {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const keyInsert = await client.query(
      `INSERT INTO listing_submission_keys (seller_id, idempotency_key)
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
      [userId, idempotencyKey],
    );
    if (!keyInsert.rowCount) {
      const previous = await client.query<{ car_id: string | null }>(
        "SELECT car_id::text FROM listing_submission_keys WHERE seller_id = $1 AND idempotency_key = $2 FOR UPDATE",
        [userId, idempotencyKey],
      );
      const previousId = previous.rows[0]?.car_id;
      if (!previousId) throw createError({ statusCode: 409, statusMessage: "This listing submission is already being processed." });
      const saved = await getOwnListing(client, userId, previousId);
      if (!saved) throw createError({ statusCode: 409, statusMessage: "This listing submission is no longer available." });
      await client.query("COMMIT");
      return { listing: saved, created: false };
    }
    await validateReferences(client, userId, listing);
    const id = await createListing(client, userId, listing, status);
    await lockListingImages(client, id);
    await syncListingImages(client, userId, id, photos, imageOrder);
    await client.query(
      "UPDATE listing_submission_keys SET car_id = $1 WHERE seller_id = $2 AND idempotency_key = $3",
      [id, userId, idempotencyKey],
    );
    const saved = await getOwnListing(client, userId, id);
    if (!saved) throw createError({ statusCode: 500, statusMessage: "Unable to load the new listing." });
    await client.query("COMMIT");
    return { listing: saved, created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const changeListing = async (
  database: Pool,
  userId: string,
  id: string,
  changes: {
    listing?: ListingInput;
    status?: "DRAFT" | "PENDING" | "SOLD" | "ARCHIVED";
    photos?: ListingPhotoUpload[];
    imageOrder?: ListingImageOrderItem[];
  },
) => {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await lockListingImages(client, id);
    const result = await client.query<{ status: ListingStatus }>(
      "SELECT status FROM cars WHERE id = $1 AND seller_id = $2 FOR UPDATE", [id, userId],
    );
    const current = result.rows[0];
    if (!current) throw createError({ statusCode: 404, statusMessage: "Listing not found." });
    if (changes.listing && (changes.status === "SOLD" || changes.status === "ARCHIVED")) {
      throw createError({ statusCode: 400, statusMessage: "Save listing changes before changing its status." });
    }
    if (changes.status === "SOLD" && current.status !== "ACTIVE") {
      throw createError({ statusCode: 409, statusMessage: "Only an active listing can be marked as sold." });
    }
    const nextStatus: ListingStatus = changes.status ?? (changes.listing && current.status !== "DRAFT" ? "PENDING" : current.status);
    if (changes.listing) {
      await validateReferences(client, userId, changes.listing);
      await updateListing(client, userId, id, changes.listing, nextStatus);
    } else if (changes.status === "SOLD") {
      await client.query(
        `UPDATE cars
         SET status = 'SOLD', sale_confirmation_status = 'PENDING',
             sale_confirmation_reason = NULL, sale_reviewed_by = NULL, sale_reviewed_at = NULL,
             updated_at = NOW()
         WHERE id = $1 AND seller_id = $2`,
        [id, userId],
      );
    } else {
      await client.query(
        `UPDATE cars
         SET status = $1::VARCHAR(20),
             sale_confirmation_status = CASE WHEN $1::VARCHAR(20) IN ('DRAFT', 'PENDING', 'ARCHIVED') THEN 'NOT_REQUESTED'
               ELSE sale_confirmation_status END,
             sale_confirmation_reason = CASE WHEN $1::VARCHAR(20) IN ('DRAFT', 'PENDING', 'ARCHIVED') THEN NULL
               ELSE sale_confirmation_reason END,
             sale_reviewed_by = CASE WHEN $1::VARCHAR(20) IN ('DRAFT', 'PENDING', 'ARCHIVED') THEN NULL
               ELSE sale_reviewed_by END,
             sale_reviewed_at = CASE WHEN $1::VARCHAR(20) IN ('DRAFT', 'PENDING', 'ARCHIVED') THEN NULL
               ELSE sale_reviewed_at END,
             updated_at = NOW()
         WHERE id = $2 AND seller_id = $3`,
        [nextStatus, id, userId],
      );
    }
    const removedImages = changes.photos !== undefined || changes.imageOrder !== undefined
      ? await syncListingImages(client, userId, id, changes.photos ?? [], changes.imageOrder)
      : [];
    await updateListingImageVisibility(client, id, nextStatus);
    const saved = await getOwnListing(client, userId, id);
    if (!saved) throw createError({ statusCode: 500, statusMessage: "Unable to load the updated listing." });
    await client.query("COMMIT");
    await removeListingImages(id, removedImages);
    return saved;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
