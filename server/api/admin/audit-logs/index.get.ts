import { getAdminAuditLogs } from "../../../repositories/admin";
import { requireAdminUser } from "../../../utils/admin-auth";
import { getDatabase } from "../../../utils/db";
import { adminPageSchema } from "../../../validators/admin";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsed = adminPageSchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check the audit log pagination." });
  return getAdminAuditLogs(getDatabase(event), parsed.data.page, parsed.data.limit);
});
