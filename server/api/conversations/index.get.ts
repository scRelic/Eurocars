import { getDatabase } from "../../utils/db";
import { requireMessageUser } from "../../utils/messaging";

export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const result = await getDatabase(event).query(
    `SELECT c.id::text, c.car_id::text AS "carId", cars.title AS "carTitle", cars.status AS "carStatus",
       other.id::text AS "otherId",
       COALESCE(NULLIF(CONCAT_WS(' ', other.first_name, other.last_name), ''), 'User') AS "otherName",
       other.avatar_url AS "otherAvatarUrl", c.updated_at AS "updatedAt",
       (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS "lastMessage",
       (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread
     FROM conversations c JOIN cars ON cars.id = c.car_id
     JOIN users other ON other.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
     WHERE c.buyer_id = $1 OR c.seller_id = $1
     ORDER BY c.updated_at DESC, c.id DESC`,
    [user.id],
  );
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { items: result.rows };
});
