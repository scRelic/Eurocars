import { getAuthenticatedUser } from "../../../../../utils/auth";
import { isAdminUser } from "../../../../../utils/admin-auth";
import { getDatabase } from "../../../../../utils/db";
import { listingId } from "../../../../../utils/listing-auth";
import { privateBlobToken } from "../../../../../utils/image-upload-api";
import { syncListingImage } from "../../../../../services/images/sync-listing-image.service";
import { VercelBlobStore } from "../../../../../services/storage/vercel-blob.service";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to manage listing photos." });
  const carId = listingId(getRouterParam(event, "id"));
  const imageId = listingId(getRouterParam(event, "imageId"));
  const database = getDatabase(event);
  const admin = await isAdminUser(event);
  const allowed = await database.query(
    `SELECT 1 FROM car_images i JOIN cars c ON c.id = i.car_id
     WHERE c.id = $1 AND i.id = $2 AND (c.seller_id = $3 OR $4::boolean)`,
    [carId, imageId, user.id, admin],
  );
  if (!allowed.rowCount) throw createError({ statusCode: 404, statusMessage: "Photo not found." });
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!publicToken?.trim()) throw createError({ statusCode: 503, statusMessage: "Image storage is unavailable." });
  const processed = await syncListingImage(
    database, new VercelBlobStore("private", privateBlobToken()), new VercelBlobStore("public", publicToken), imageId,
  );
  const pending = await database.query("SELECT 1 FROM image_sync_jobs WHERE image_id = $1", [imageId]);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { processed, pending: !!pending.rowCount };
});
