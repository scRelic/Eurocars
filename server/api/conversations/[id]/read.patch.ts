import { z } from "zod";
import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";
import { requireConversation, requireMessageUser } from "../../../utils/messaging";
import { idSchema } from "../../../validators/listing";

const schema = z.object({ throughId: idSchema }).strict();
export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid read position." });
  await requireConversation(event, id, user.id);
  await getDatabase(event).query(
    `WITH updated AS (
       UPDATE messages SET read_at = NOW() WHERE conversation_id = $1 AND sender_id <> $2
       AND id <= $3 AND read_at IS NULL
       AND EXISTS (SELECT 1 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2))
       RETURNING id
     )
     UPDATE notifications SET read_at = NOW()
     WHERE user_id = $2 AND conversation_id = $1 AND type = 'NEW_MESSAGE'
       AND message_id <= $3 AND read_at IS NULL`,
    [id, user.id, parsed.data.throughId],
  );
  return { success: true };
});
