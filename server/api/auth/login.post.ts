import { getDatabase } from "../../utils/db";
import { verifyPassword, hashPassword } from "../../utils/password";
import { createSessionToken, storeSession } from "../../utils/sessions";
import { toAuthUser } from "../../utils/auth";
import type { UserRow } from "../../utils/auth";
import { loginSchema } from "../../validators/auth";
import { enforceAuthRateLimit } from "../../utils/auth-rate-limit";

const dummyHash = hashPassword("EuroCars-Invalid-Account-Password");

export default defineEventHandler(async (event) => {
  await enforceAuthRateLimit(event);
  const parsed = loginSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Enter a valid email address and password." });
  }
  const { email, password, rememberMe } = parsed.data;

  const database = await getDatabase(event);
  const result = await database.query<UserRow & { passwordHash: string }>(
    `SELECT id, first_name AS "firstName", last_name AS "lastName", email, role,
            phone, avatar_url AS "avatarUrl", country_code AS "countryCode", city,
            created_at AS "createdAt", password_hash AS "passwordHash"
     FROM users
     WHERE LOWER(email) = $1 AND deleted_at IS NULL
       AND COALESCE(to_jsonb(users)->>'account_status', 'ACTIVE') = 'ACTIVE'`,
    [email],
  );
  const account = result.rows[0];
  const passwordHash = account?.passwordHash ?? (await dummyHash);
  const passwordIsValid = await verifyPassword(password, passwordHash);

  if (!account || !passwordIsValid) {
    throw createError({ statusCode: 401, statusMessage: "Email address or password is incorrect." });
  }

  if (account.passwordHash.startsWith("scrypt$")) {
    const updated = await database.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash = $3 AND deleted_at IS NULL",
      [await hashPassword(password), account.id, account.passwordHash],
    );
    if (updated.rowCount !== 1) {
      throw createError({ statusCode: 401, statusMessage: "Email address or password is incorrect." });
    }
  }

  const token = createSessionToken();
  await storeSession(event, database, token, account.id, rememberMe);

  return {
    user: toAuthUser(account),
  };
});
