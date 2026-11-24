import { getAuthenticatedUser } from "../../../utils/auth";
import { enforceAuthRateLimit } from "../../../utils/auth-rate-limit";
import { getDatabase } from "../../../utils/db";
import { hashPassword, verifyPassword } from "../../../utils/password";
import { getSessionToken, sessionTokenHashes } from "../../../utils/sessions";
import { changePasswordSchema } from "../../../validators/profile";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to change your password." });
  }
  await enforceAuthRateLimit(event);
  const parsed = changePasswordSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Enter your current password and a new password of 8–128 characters." });
  }

  const token = getSessionToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to change your password." });
  }
  const database = getDatabase(event);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ passwordHash: string }>(
      `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [user.id],
    );
    if (!account.rows[0] || !(await verifyPassword(parsed.data.currentPassword, account.rows[0].passwordHash))) {
      throw createError({ statusCode: 401, statusMessage: "Your current password is incorrect." });
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, user.id]);
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL AND NOT (token_hash = ANY($2::text[]))`,
      [user.id, sessionTokenHashes(event, token)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { success: true };
});
