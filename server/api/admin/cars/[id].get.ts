import { getAdminCar } from "../../../repositories/admin";
import { requireAdminUser } from "../../../utils/admin-auth";
import { getDatabase } from "../../../utils/db";
import { adminIdSchema } from "../../../validators/admin";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid listing ID." });
  const listing = await getAdminCar(getDatabase(event), parsedId.data);
  if (!listing) throw createError({ statusCode: 404, statusMessage: "Listing not found." });
  return { listing };
});
