import { send, sendStream } from "h3";
import { getAuthenticatedUser } from "../../../../utils/auth";
import { isAdminUser } from "../../../../utils/admin-auth";
import { getDatabase } from "../../../../utils/db";
import { listingId } from "../../../../utils/listing-auth";
import { readListingImageFile } from "../../../../utils/listing-image-storage";
import { privateBlobToken } from "../../../../utils/image-upload-api";
import { listingBlobPath } from "../../../../services/images/listing-image-state.service";
import { VercelBlobStore } from "../../../../services/storage/vercel-blob.service";

export default defineEventHandler(async (event) => {
  const carId = listingId(getRouterParam(event, "id"));
  const imageId = listingId(getRouterParam(event, "imageId"));
  const result = await getDatabase(event).query<{
    image_url: string; status: string; seller_id: string; storage_provider: string;
    private_key: string | null; upload_id: string | null;
  }>(
    `SELECT i.image_url, c.status, c.seller_id::text,
      COALESCE(to_jsonb(i)->>'storage_provider', 'LOCAL') AS storage_provider,
      to_jsonb(i)->>'private_key' AS private_key, to_jsonb(i)->>'upload_id' AS upload_id
     FROM car_images i JOIN cars c ON c.id = i.car_id
     WHERE c.id = $1 AND i.id = $2`,
    [carId, imageId],
  );
  const image = result.rows[0];
  if (!image) throw createError({ statusCode: 404, statusMessage: "Photo not found." });

  if (image.status !== "ACTIVE") {
    const user = await getAuthenticatedUser(event);
    if ((!user || user.id !== image.seller_id) && !(await isAdminUser(event))) {
      throw createError({ statusCode: 404, statusMessage: "Photo not found." });
    }
  }

  if (image.storage_provider === "BLOB") {
    const temporary = image.private_key ? null : await getDatabase(event).query<{ pathname: string }>(
      "SELECT pathname FROM image_upload_variants WHERE upload_id = $1 AND variant = 'gallery'", [image.upload_id],
    );
    const pathname = image.private_key ? listingBlobPath(carId, image.private_key, "gallery") : temporary?.rows[0]?.pathname;
    if (!pathname) throw createError({ statusCode: 404, statusMessage: "Photo not found." });
    const stored = await new VercelBlobStore("private", privateBlobToken()).getImage(pathname);
    if (!stored || stored.statusCode !== 200 || stored.blob.pathname !== pathname
      || stored.blob.contentType !== "image/webp") {
      if (stored?.stream) await stored.stream.cancel();
      throw createError({ statusCode: 404, statusMessage: "Photo not found." });
    }
    setResponseHeader(event, "Cache-Control", "private, no-store");
    setResponseHeader(event, "X-Content-Type-Options", "nosniff");
    setResponseHeader(event, "Content-Type", "image/webp");
    return sendStream(event, stored.stream);
  }

  const stored = await readListingImageFile(carId, imageId, image.image_url);
  if (!stored) throw createError({ statusCode: 404, statusMessage: "Photo not found." });
  setResponseHeader(event, "Cache-Control", "private, no-store");
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  return send(event, stored.data, stored.mimeType);
});
