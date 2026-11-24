import type { H3Event } from "h3";
import { getAuthenticatedUser } from "./auth";
import { idSchema } from "../validators/listing";

export const requireListingUser = async (event: H3Event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to manage your listings." });
  return user;
};

export const listingId = (value: string | undefined) => {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid listing ID." });
  return parsed.data;
};
