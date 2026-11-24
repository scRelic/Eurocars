import type { H3Event } from "h3";
import type { QueryResultRow } from "pg";
import type { AuthUser } from "../../shared/types/auth";
import { getDatabase } from "./db";
import { getSessionToken, sessionTokenHashes } from "./sessions";

export type UserRow = QueryResultRow & {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: AuthUser["role"];
  phone: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  city: string | null;
  createdAt: Date;
};

export const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  role: row.role,
  phone: row.phone,
  avatarUrl: row.avatarUrl,
  countryCode: row.countryCode,
  city: row.city,
  createdAt: row.createdAt.toISOString(),
});

export const getAuthenticatedUser = async (event: H3Event) => {
  const token = getSessionToken(event);
  if (!token) {
    return null;
  }

  const database = await getDatabase(event);
  const result = await database.query<UserRow>(
    `SELECT users.id, users.first_name AS "firstName", users.last_name AS "lastName",
            users.email, users.role, users.phone, users.avatar_url AS "avatarUrl",
            users.country_code AS "countryCode", users.city, users.created_at AS "createdAt"
     FROM refresh_tokens AS sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ANY($1::text[]) AND sessions.expires_at > NOW()
       AND sessions.revoked_at IS NULL AND users.deleted_at IS NULL
       AND COALESCE(to_jsonb(users)->>'account_status', 'ACTIVE') = 'ACTIVE'`,
    [sessionTokenHashes(event, token)],
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
};
