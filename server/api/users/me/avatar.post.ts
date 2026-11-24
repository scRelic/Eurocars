import { randomUUID } from "node:crypto";
import { readMultipartFormData } from "h3";
import { getAuthenticatedUser, toAuthUser } from "../../../utils/auth";
import type { UserRow } from "../../../utils/auth";
import { avatarUrl, removeAvatarFile, removePreviousAvatar, saveAvatarFile } from "../../../utils/avatar-storage";
import { getDatabase } from "../../../utils/db";
import { readBoundedRequestBody } from "../../../utils/listing-image-upload";
import { imageType } from "../../../utils/image-signature";
import { ImageProcessingBusyError, ImageValidationError, processAvatarImage } from "../../../services/images/image-processing.service";

const maxPhotoBytes = 5 * 1024 * 1024;
const maxRequestBytes = maxPhotoBytes + 256 * 1024;

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to update your profile photo." });
  if (!(getRequestHeader(event, "content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    throw createError({ statusCode: 400, statusMessage: "Select a photo to upload." });
  }
  const contentLength = Number(getRequestHeader(event, "content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    throw createError({ statusCode: 413, statusMessage: "Photo upload exceeds the maximum request size." });
  }
  const body = await readBoundedRequestBody(event, maxRequestBytes, "Photo upload exceeds the maximum request size.");
  const bytes = new Uint8Array(body.length);
  bytes.set(body);
  event._requestBody = new Blob([bytes.buffer]).stream();
  const parts = await readMultipartFormData(event);
  if (!parts || parts.length !== 1 || parts[0]?.name !== "photo" || parts[0].filename === undefined) {
    throw createError({ statusCode: 400, statusMessage: "Select one photo to upload." });
  }
  const photo = parts[0].data;
  if (photo.length > maxPhotoBytes) throw createError({ statusCode: 413, statusMessage: "The photo must be 5 MB or smaller." });
  if (!imageType(photo)) throw createError({ statusCode: 400, statusMessage: "The photo must be a JPEG, PNG or WebP image." });

  let processedPhoto: Buffer;
  try {
    processedPhoto = (await processAvatarImage(photo)).data;
  } catch (error) {
    if (error instanceof ImageProcessingBusyError) {
      setResponseHeader(event, "Retry-After", 5);
      throw createError({ statusCode: 503, statusMessage: error.message });
    }
    if (error instanceof ImageValidationError) {
      throw createError({ statusCode: 400, statusMessage: "The photo must be a valid, non-animated JPEG, PNG or WebP image within the size limits." });
    }
    throw error;
  }
  const token = randomUUID();
  const url = avatarUrl(user.id, token);
  await saveAvatarFile(user.id, token, processedPhoto);
  let row: (UserRow & { previousAvatarUrl: string | null }) | undefined;
  const client = await getDatabase(event).connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('avatar-reference', 0))");
    const result = await client.query<UserRow & { previousAvatarUrl: string | null }>(
      `WITH previous AS (
         SELECT id, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
       )
       UPDATE users SET avatar_url = $2, updated_at = NOW()
       FROM previous WHERE users.id = previous.id
       RETURNING users.id, users.first_name AS "firstName", users.last_name AS "lastName",
         users.email, users.role, users.phone, users.avatar_url AS "avatarUrl",
         users.country_code AS "countryCode", users.city, users.created_at AS "createdAt",
         previous.avatar_url AS "previousAvatarUrl"`,
      [user.id, url],
    );
    row = result.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Avatar update failed; its file may require cleanup.");
    throw error;
  } finally {
    client.release();
  }
  if (!row) {
    try { await removeAvatarFile(user.id, token); } catch { console.error("Could not remove an uncommitted avatar file."); }
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }
  await removePreviousAvatar(user.id, row.previousAvatarUrl);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { user: toAuthUser(row) };
});
