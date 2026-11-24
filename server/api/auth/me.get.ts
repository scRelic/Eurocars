import { getAuthenticatedUser } from "../../utils/auth";

export default defineEventHandler(async (event) => ({
  user: await getAuthenticatedUser(event),
}));
