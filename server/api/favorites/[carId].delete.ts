import { getAuthenticatedUser } from "../../utils/auth";
import { getDatabase } from "../../utils/db";
import { listingId } from "../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to manage your saved cars." });
  const id = listingId(getRouterParam(event, "carId"));
  await getDatabase(event).query("DELETE FROM favorites WHERE user_id = $1 AND car_id = $2", [user.id, id]);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { success: true };
});
