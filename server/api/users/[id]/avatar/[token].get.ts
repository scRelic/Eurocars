import { send } from "h3";
import { getAuthenticatedUser } from "../../../../utils/auth";
import { avatarUrl, readAvatarFile } from "../../../../utils/avatar-storage";
import { getDatabase } from "../../../../utils/db";
import { listingId } from "../../../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const token = getRouterParam(event, "token") ?? "";
  const url = avatarUrl(id, token);
  const result = await getDatabase(event).query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.avatar_url = $2 AND u.deleted_at IS NULL
     AND (u.id = $3::bigint OR $4::boolean
       OR EXISTS (SELECT 1 FROM cars c WHERE c.seller_id = u.id AND c.status = 'ACTIVE')
       OR EXISTS (SELECT 1 FROM conversations c WHERE (c.buyer_id = u.id AND c.seller_id = $3::bigint)
                   OR (c.seller_id = u.id AND c.buyer_id = $3::bigint)))`,
    [id, url, user?.id ?? null, user?.role === "ADMIN"],
  );
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: "Photo not found." });
  const photo = await readAvatarFile(id, token);
  if (!photo) throw createError({ statusCode: 404, statusMessage: "Photo not found." });
  setResponseHeader(event, "Cache-Control", "private, no-store");
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  return send(event, photo.data, photo.mimeType);
});
