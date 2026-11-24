import { changeAdminListingStatus } from "../../../../services/admin";
import { requireAdminUser } from "../../../../utils/admin-auth";
import { getDatabase } from "../../../../utils/db";
import { adminIdSchema, adminListingStatusSchema } from "../../../../validators/admin";

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid listing ID." });
  const parsedBody = adminListingStatusSchema.safeParse(await readBody(event));
  if (!parsedBody.success) throw createError({ statusCode: 400, statusMessage: "A valid status and rejection reason are required." });
  return {
    listing: await changeAdminListingStatus(
      getDatabase(event),
      admin.id,
      parsedId.data,
      parsedBody.data.status,
      parsedBody.data.reason,
    ),
  };
});
