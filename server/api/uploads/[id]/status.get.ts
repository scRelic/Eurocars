import { getDatabase } from "../../../utils/db";
import { requireListingUser } from "../../../utils/listing-auth";
import { uploadIdSchema } from "../../../utils/image-upload-api";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const parsed = uploadIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid upload session." });
  const result = await getDatabase(event).query<{ status: string }>(
    `SELECT CASE WHEN expires_at <= NOW() AND consumed_at IS NULL THEN 'EXPIRED' ELSE status END AS status
     FROM image_uploads WHERE id = $1 AND user_id = $2`,
    [parsed.data, user.id],
  );
  if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: "Upload session is unavailable." });
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { id: parsed.data, status: result.rows[0].status };
});
