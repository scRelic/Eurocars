import { reviewSaleConfirmation } from "../../../../services/admin";
import { requireAdminUser } from "../../../../utils/admin-auth";
import { getDatabase } from "../../../../utils/db";
import { adminIdSchema, adminSaleDecisionSchema } from "../../../../validators/admin";

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const parsedId = adminIdSchema.safeParse(getRouterParam(event, "id"));
  if (!parsedId.success) throw createError({ statusCode: 400, statusMessage: "Invalid listing ID." });
  const parsedBody = adminSaleDecisionSchema.safeParse(await readBody(event));
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: "A valid sale decision and rejection reason are required." });
  }
  return {
    listing: await reviewSaleConfirmation(
      getDatabase(event),
      admin.id,
      parsedId.data,
      parsedBody.data.decision,
      parsedBody.data.reason,
    ),
  };
});
