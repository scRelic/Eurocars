import { requireAdminUser } from "../../utils/admin-auth";

export default defineEventHandler(async (event) => ({
  user: await requireAdminUser(event),
}));
