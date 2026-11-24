import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireMessageUser } from "../../utils/messaging";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) });

export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid notification page." });
  const result = await getDatabase(event).query(
    `SELECT n.id::text, n.type, c.title AS "carTitle", n.conversation_id::text AS "conversationId",
       n.reason, n.read_at AS "readAt", n.created_at AS "createdAt"
     FROM notifications n JOIN cars c ON c.id = n.car_id
     WHERE n.user_id = $1 ORDER BY n.id DESC LIMIT 21 OFFSET $2`,
    [user.id, (parsed.data.page - 1) * 20],
  );
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { items: result.rows.slice(0, 20), hasMore: result.rows.length > 20 };
});
