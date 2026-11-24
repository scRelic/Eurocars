import type { H3Event } from "h3";
import type { QueryResultRow } from "pg";
import { getDatabase } from "./db";
import { getSessionToken, sessionTokenHashes } from "./sessions";

export type AdminIdentity = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

type AdminUserRow = QueryResultRow & AdminIdentity & { role: string };

export const isAdminUser = async (event: H3Event) => {
  const token = getSessionToken(event);
  if (!token) return false;

  const database = await getDatabase(event);
  const result = await database.query<{ isAdmin: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM refresh_tokens AS sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ANY($1::text[]) AND sessions.expires_at > NOW()
         AND sessions.revoked_at IS NULL AND users.deleted_at IS NULL
         AND users.role = 'ADMIN'
         AND COALESCE(to_jsonb(users)->>'account_status', 'ACTIVE') = 'ACTIVE'
     ) AS "isAdmin"`,
    [sessionTokenHashes(event, token)],
  );
  return result.rows[0]?.isAdmin === true;
};

export const requireAdminUser = async (event: H3Event): Promise<AdminIdentity> => {
  const token = getSessionToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to access the admin panel." });
  }

  const database = await getDatabase(event);
  const result = await database.query<AdminUserRow>(
    `SELECT users.id::text, users.email, users.first_name AS "firstName",
            users.last_name AS "lastName", users.role
     FROM refresh_tokens AS sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ANY($1::text[]) AND sessions.expires_at > NOW()
       AND sessions.revoked_at IS NULL AND users.deleted_at IS NULL
       AND COALESCE(to_jsonb(users)->>'account_status', 'ACTIVE') = 'ACTIVE'`,
    [sessionTokenHashes(event, token)],
  );
  const user = result.rows[0];
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Your session is invalid or has expired." });
  }
  if (user.role !== "ADMIN") {
    throw createError({ statusCode: 403, statusMessage: "Administrator access is required." });
  }

  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
};
