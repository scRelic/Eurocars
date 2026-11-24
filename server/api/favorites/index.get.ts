import { getFavoriteCars } from "../../repositories/public-cars";
import { getAuthenticatedUser } from "../../utils/auth";
import { getDatabase } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to view your saved cars." });
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { items: await getFavoriteCars(getDatabase(event), user.id) };
});
