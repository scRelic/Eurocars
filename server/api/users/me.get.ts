import { getAuthenticatedUser } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to access your profile." });
  }
  return { user };
});
