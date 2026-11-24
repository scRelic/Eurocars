import { changeAdminDealerVerification } from "../../../../services/admin";
import { requireAdminUser } from "../../../../utils/admin-auth";
import { getDatabase } from "../../../../utils/db";
import { adminDealerVerificationSchema, adminIdSchema } from "../../../../validators/admin";

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid dealership ID." });
  const parsedBody = adminDealerVerificationSchema.safeParse(await readBody(event));
  if (!parsedBody.success) throw createError({ statusCode: 400, statusMessage: "Choose a valid verification state." });
  return {
    dealer: await changeAdminDealerVerification(
      getDatabase(event), admin.id, parsedId.data, parsedBody.data.verified,
    ),
  };
});
