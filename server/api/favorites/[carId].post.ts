import { getPublicCar } from "../../repositories/public-cars";
import { getAuthenticatedUser } from "../../utils/auth";
import { getDatabase } from "../../utils/db";
import { listingId } from "../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to save cars." });
  const id = listingId(getRouterParam(event, "carId"));
  const database = getDatabase(event);
  const car = await getPublicCar(database, id);
  if (!car) throw createError({ statusCode: 404, statusMessage: "This listing is no longer available." });
  const result = await database.query(
    `INSERT INTO favorites (user_id, car_id)
     SELECT $1, id FROM cars WHERE id = $2 AND status = 'ACTIVE'
     ON CONFLICT (user_id, car_id) DO NOTHING`,
    [user.id, id],
  );
  if (!result.rowCount && !(await getPublicCar(database, id))) {
    throw createError({ statusCode: 404, statusMessage: "This listing is no longer available." });
  }
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { car };
});
