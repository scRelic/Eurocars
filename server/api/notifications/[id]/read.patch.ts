import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";
import { requireMessageUser } from "../../../utils/messaging";

export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const result = await getDatabase(event).query(
    "UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id",
    [id, user.id],
  );
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: "Notification not found." });
  return { success: true };
});
