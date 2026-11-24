import { hashPassword } from "../../utils/password";
import { createSessionToken, hashSessionToken, setSessionCookie } from "../../utils/sessions";
import { getDatabase } from "../../utils/db";
import { toAuthUser } from "../../utils/auth";
import type { UserRow } from "../../utils/auth";
import { registrationSchema } from "../../validators/auth";
import { enforceAuthRateLimit } from "../../utils/auth-rate-limit";

export default defineEventHandler(async (event) => {
  await enforceAuthRateLimit(event);
  const parsed = registrationSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Enter a valid name, email address and password (8–128 characters)." });
  }
  const { firstName, lastName, email, password } = parsed.data;

  const database = await getDatabase(event);
  const token = createSessionToken();
  const passwordHash = await hashPassword(password);
  let result;

  try {
    result = await database.query<UserRow>(
      `WITH new_user AS (
         INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, first_name AS "firstName", last_name AS "lastName", email, role, phone,
                   avatar_url AS "avatarUrl", country_code AS "countryCode", city, created_at AS "createdAt"
       ),
       new_session AS (
         INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
         SELECT $5, id, NOW() + INTERVAL '12 hours' FROM new_user
         RETURNING user_id
       )
       SELECT new_user.id, new_user."firstName", new_user."lastName", new_user.email, new_user.role, new_user.phone,
              new_user."avatarUrl", new_user."countryCode", new_user.city, new_user."createdAt"
       FROM new_user JOIN new_session ON new_session.user_id = new_user.id`,
      [firstName, lastName || null, email, passwordHash, hashSessionToken(event, token)],
    );
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505"
      && "constraint" in error && error.constraint === "users_email_unique") {
      throw createError({ statusCode: 409, statusMessage: "An account with this email address already exists." });
    }
    throw error;
  }

  const user = result.rows[0];
  if (!user) {
    throw createError({ statusCode: 500, statusMessage: "The account could not be created." });
  }

  setSessionCookie(event, token, 60 * 60 * 12);

  return { user: toAuthUser(user) };
});
