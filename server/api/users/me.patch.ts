import { getAuthenticatedUser, toAuthUser } from "../../utils/auth";
import type { UserRow } from "../../utils/auth";
import { getDatabase } from "../../utils/db";
import { removePreviousAvatar } from "../../utils/avatar-storage";
import { profileSchema } from "../../validators/profile";

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to update your profile." });
  }
  const parsed = profileSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Check your profile details and try again." });
  }
  const { firstName, lastName, phone, countryCode, city, avatarUrl } = parsed.data;
  if (avatarUrl?.startsWith("/api/users/") && avatarUrl !== user.avatarUrl) {
    throw createError({ statusCode: 400, statusMessage: "Please upload a new profile photo." });
  }
  const database = getDatabase(event);
  if (countryCode) {
    const country = await database.query("SELECT 1 FROM countries WHERE code = $1", [countryCode]);
    if (!country.rowCount) {
      throw createError({ statusCode: 400, statusMessage: "Please enter a supported country code." });
    }
  }

  const client = await database.connect();
  let row: (UserRow & { previousAvatarUrl: string | null }) | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('avatar-reference', 0))");
    const result = await client.query<UserRow & { previousAvatarUrl: string | null }>(
    `WITH previous AS (SELECT id, avatar_url FROM users WHERE id = $7 AND deleted_at IS NULL FOR UPDATE)
     UPDATE users SET first_name = $1, last_name = $2, phone = $3, country_code = $4,
       city = $5, avatar_url = $6, updated_at = NOW()
     FROM previous WHERE users.id = previous.id
       AND ($6::text IS NULL OR $6 NOT LIKE '/api/users/%' OR previous.avatar_url = $6)
     RETURNING users.id, users.first_name AS "firstName", users.last_name AS "lastName",
       users.email, users.role, users.phone, users.avatar_url AS "avatarUrl",
       users.country_code AS "countryCode", users.city, users.created_at AS "createdAt",
       previous.avatar_url AS "previousAvatarUrl"`,
    [firstName, lastName, phone, countryCode, city, avatarUrl, user.id],
    );
    row = result.rows[0];
    if (!row) {
      throw createError({ statusCode: 409, statusMessage: "Your profile photo changed. Refresh and try again." });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!row) {
    throw createError({ statusCode: 409, statusMessage: "Your profile photo changed. Refresh and try again." });
  }
  if (row.previousAvatarUrl !== avatarUrl) await removePreviousAvatar(user.id, row.previousAvatarUrl);
  return { user: toAuthUser(row) };
});
