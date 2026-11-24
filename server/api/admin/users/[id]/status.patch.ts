import { changeAdminUserStatus } from "../../../../services/admin";
import { requireAdminUser } from "../../../../utils/admin-auth";
import { getDatabase } from "../../../../utils/db";
import { adminIdSchema, adminUserStatusSchema } from "../../../../validators/admin";

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid user ID." });
  const parsedBody = adminUserStatusSchema.safeParse(await readBody(event));
  if (!parsedBody.success) throw createError({ statusCode: 400, statusMessage: "Choose a valid account status." });
  return {
    user: await changeAdminUserStatus(getDatabase(event), admin.id, parsedId.data, parsedBody.data.status),
  };
});
