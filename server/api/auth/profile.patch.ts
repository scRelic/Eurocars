import { getAuthenticatedUser, toAuthUser } from "../../utils/auth";
import type { UserRow } from "../../utils/auth";
import { getDatabase } from "../../utils/db";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to update your profile." });
  }

  const body: unknown = await readBody(event);
  if (!isRecord(body) || typeof body.firstName !== "string" || typeof body.lastName !== "string") {
    throw createError({ statusCode: 400, statusMessage: "Provide your first and last name." });
  }
  const firstName = body.firstName.trim();
  const lastName = body.lastName.trim();
  if (!firstName || firstName.length > 100 || lastName.length > 100) {
    throw createError({ statusCode: 400, statusMessage: "Enter a first name and a last name of up to 100 characters each." });
  }

  const database = await getDatabase(event);
  const result = await database.query<UserRow>(
    `UPDATE users
     SET first_name = $1, last_name = $2, updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING id, first_name AS "firstName", last_name AS "lastName",
               email, role, phone, avatar_url AS "avatarUrl", country_code AS "countryCode", city,
               created_at AS "createdAt"`,
    [firstName, lastName || null, user.id],
  );

  if (!result.rows[0]) {
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }

  return { user: toAuthUser(result.rows[0]) };
});
