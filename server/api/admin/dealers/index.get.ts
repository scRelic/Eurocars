import { getAdminDealers } from "../../../repositories/admin";
import { requireAdminUser } from "../../../utils/admin-auth";
import { getDatabase } from "../../../utils/db";
import { adminDealersQuerySchema } from "../../../validators/admin";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsed = adminDealersQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check the dealership filters and try again." });
  return getAdminDealers(getDatabase(event), parsed.data);
});
