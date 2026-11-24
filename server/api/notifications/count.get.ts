import { getDatabase } from "../../utils/db";
import { requireMessageUser } from "../../utils/messaging";

export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const result = await getDatabase(event).query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [user.id],
  );
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { count: result.rows[0]!.count };
});
