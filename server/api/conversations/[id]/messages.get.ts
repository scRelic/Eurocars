import { z } from "zod";
import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";
import { requireConversation, requireMessageUser } from "../../../utils/messaging";
import { idSchema } from "../../../validators/listing";

const querySchema = z.object({ before: idSchema.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }).strict();
export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid message pagination." });
  await requireConversation(event, id, user.id);
  const { before, limit } = parsed.data;
  const result = await getDatabase(event).query(
    `SELECT m.id::text, m.sender_id::text AS "senderId", m.content, m.created_at AS "createdAt", m.read_at AS "readAt"
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)
       AND ($3::bigint IS NULL OR m.id < $3::bigint)
     ORDER BY m.id DESC LIMIT $4`,
    [id, user.id, before ?? null, limit + 1],
  );
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { items: result.rows.slice(0, limit).reverse(), hasMore: result.rows.length > limit };
});
