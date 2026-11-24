import { getAdminUser } from "../../../repositories/admin";
import { requireAdminUser } from "../../../utils/admin-auth";
import { getDatabase } from "../../../utils/db";
import { adminIdSchema } from "../../../validators/admin";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid user ID." });
  const user = await getAdminUser(getDatabase(event), parsedId.data);
  if (!user) throw createError({ statusCode: 404, statusMessage: "User not found." });
  return { user };
});
