import type { H3Event } from "h3";

export const getSessionSecret = (event: H3Event) => {
  const secret = process.env.SESSION_SECRET || useRuntimeConfig(event).sessionSecret;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw createError({ statusCode: 503, statusMessage: "Account service is not configured." });
  }
  return secret;
};
