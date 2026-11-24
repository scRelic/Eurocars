import { getAdminCars } from "../../../repositories/admin";
import { requireAdminUser } from "../../../utils/admin-auth";
import { getDatabase } from "../../../utils/db";
import { adminCarsQuerySchema } from "../../../validators/admin";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsed = adminCarsQuerySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check the listing filters and try again." });
  return getAdminCars(getDatabase(event), parsed.data);
});
