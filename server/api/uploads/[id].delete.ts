import { getDatabase } from "../../utils/db";
import { requireListingUser } from "../../utils/listing-auth";
import { uploadIdSchema } from "../../utils/image-upload-api";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const parsed = uploadIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid upload session." });
  const client = await getDatabase(event).connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ temporary_blob_pathname: string }>(
      `UPDATE image_uploads SET status = 'CANCELLED'
       WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL RETURNING temporary_blob_pathname`,
      [parsed.data, user.id],
    );
    const session = result.rows[0];
    if (!session) throw createError({ statusCode: 404, statusMessage: "Upload session is unavailable." });
    await client.query(
      `UPDATE image_delete_jobs SET next_attempt_at = LEAST(next_attempt_at, NOW() + INTERVAL '1 hour')
       WHERE store = 'PRIVATE' AND pathname LIKE $1`,
      [`${session.temporary_blob_pathname}/%`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  setResponseStatus(event, 204);
  return null;
});
