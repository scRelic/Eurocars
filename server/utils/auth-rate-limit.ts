import { createHmac } from "node:crypto";
import type { H3Event } from "h3";
import { getDatabase } from "./db";
import { getSessionSecret } from "./secret";

export const enforceAuthRateLimit = async (event: H3Event) => {
  const ip = getRequestIP(event) ?? (process.env.NODE_ENV === "production" ? undefined : "development");
  if (!ip) {
    throw createError({ statusCode: 503, statusMessage: "Unable to determine a client address for authentication rate limiting." });
  }

  const key = createHmac("sha256", getSessionSecret(event)).update(`auth:${ip}`).digest("hex");
  const result = await getDatabase(event).query<{ attempts: number }>(
    `INSERT INTO auth_rate_limits (key_hash, attempts, window_start) VALUES ($1, 1, NOW())
     ON CONFLICT (key_hash) DO UPDATE SET
       attempts = CASE WHEN auth_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
                       THEN 1 ELSE auth_rate_limits.attempts + 1 END,
       window_start = CASE WHEN auth_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
                           THEN NOW() ELSE auth_rate_limits.window_start END
     RETURNING attempts`,
    [key],
  );
  const row = result.rows[0];
  if (!row) {
    throw createError({ statusCode: 503, statusMessage: "Account service is unavailable." });
  }
  if (row.attempts > 20) {
    throw createError({ statusCode: 429, statusMessage: "Too many attempts. Please try again later." });
  }
};
