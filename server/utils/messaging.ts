import type { H3Event } from "h3";
import { getAuthenticatedUser } from "./auth";
import { getDatabase } from "./db";

export const requireMessageUser = async (event: H3Event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to use messages." });
  return user;
};

export const requireConversation = async (event: H3Event, conversationId: string, userId: string) => {
  const result = await getDatabase(event).query(
    "SELECT 1 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)",
    [conversationId, userId],
  );
  if (!result.rowCount) throw createError({ statusCode: 404, statusMessage: "Conversation not found." });
};
