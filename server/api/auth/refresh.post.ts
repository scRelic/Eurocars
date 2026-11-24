import { getDatabase } from "../../utils/db";
import { createSessionToken, getSessionToken, hashSessionToken, sessionTokenHashes, setSessionCookie } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  const oldToken = getSessionToken(event);
  if (!oldToken) {
    throw createError({ statusCode: 401, statusMessage: "Your session has expired. Please sign in again." });
  }

  const newToken = createSessionToken();
  const result = await getDatabase(event).query<{ expiresAt: Date }>(
    `UPDATE refresh_tokens SET token_hash = $1
     WHERE token_hash = ANY($2::text[]) AND revoked_at IS NULL AND expires_at > NOW()
       AND EXISTS (SELECT 1 FROM users WHERE id = refresh_tokens.user_id AND deleted_at IS NULL)
     RETURNING expires_at AS "expiresAt"`,
    [hashSessionToken(event, newToken), sessionTokenHashes(event, oldToken)],
  );
  const session = result.rows[0];
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: "Your session has expired. Please sign in again." });
  }
  const remaining = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  setSessionCookie(event, newToken, remaining);
  return { success: true };
});
