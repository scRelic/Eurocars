import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireMessageUser } from "../../utils/messaging";
import { idSchema } from "../../validators/listing";

const schema = z.object({ carId: idSchema }).strict();
export default defineEventHandler(async (event) => {
  const user = await requireMessageUser(event);
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid listing." });
  const database = getDatabase(event);
  const car = await database.query<{ sellerId: string }>(
    `SELECT c.seller_id::text AS "sellerId" FROM cars c JOIN users u ON u.id = c.seller_id
     WHERE c.id = $1 AND c.status = 'ACTIVE' AND u.deleted_at IS NULL`, [parsed.data.carId],
  );
  if (!car.rows[0]) throw createError({ statusCode: 404, statusMessage: "This listing is not available." });
  if (car.rows[0].sellerId === user.id) throw createError({ statusCode: 400, statusMessage: "You cannot message yourself." });
  const inserted = await database.query<{ id: string }>(
    `INSERT INTO conversations (car_id, buyer_id, seller_id)
     SELECT c.id, $2, c.seller_id FROM cars c JOIN users u ON u.id = c.seller_id
     WHERE c.id = $1 AND c.status = 'ACTIVE' AND c.seller_id <> $2 AND u.deleted_at IS NULL
     ON CONFLICT (car_id, buyer_id) DO NOTHING RETURNING id::text`,
    [parsed.data.carId, user.id],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id };
  const existing = await database.query<{ id: string }>(
    `SELECT c.id::text FROM conversations c JOIN cars ON cars.id = c.car_id
     WHERE c.car_id = $1 AND c.buyer_id = $2 AND cars.status = 'ACTIVE'`, [parsed.data.carId, user.id],
  );
  if (!existing.rows[0]) throw createError({ statusCode: 404, statusMessage: "This listing is not available." });
  return { id: existing.rows[0].id };
});
