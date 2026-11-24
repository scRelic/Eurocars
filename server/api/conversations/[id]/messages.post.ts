import { z } from "zod";
import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";
import { requireMessageUser } from "../../../utils/messaging";

const schema = z.object({ content: z.string().trim().min(1).max(4000) }).strict();
export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Enter a message of up to 4,000 characters." });
  const client = await getDatabase(event).connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       SELECT id, $2, $3 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)
       RETURNING id::text, sender_id::text AS "senderId", content, created_at AS "createdAt", read_at AS "readAt"`,
      [id, user.id, parsed.data.content],
    );
    if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: "Conversation not found." });
    await client.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO notifications (user_id, type, car_id, conversation_id, message_id)
       SELECT CASE WHEN buyer_id = $2 THEN seller_id ELSE buyer_id END, 'NEW_MESSAGE', car_id, id, $3
       FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`,
      [id, user.id, result.rows[0].id],
    );
    await client.query("COMMIT");
    return { message: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
