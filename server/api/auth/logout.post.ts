import { getDatabase } from "../../utils/db";
import { clearSessionCookie, getSessionToken, revokeSession } from "../../utils/sessions";

export default defineEventHandler(async (event) => {
  clearSessionCookie(event);

  if (getSessionToken(event)) {
    const database = await getDatabase(event);
    await revokeSession(event, database);
  }

  return { success: true };
});
