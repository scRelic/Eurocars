import { getDatabase } from "../../utils/db";
import { requireMessageUser } from "../../utils/messaging";

export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  await getDatabase(event).query(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
    [user.id],
  );
  return { success: true };
});
