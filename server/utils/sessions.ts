import { createHash, createHmac, randomBytes } from "node:crypto";
import type { H3Event } from "h3";
import type { Pool } from "pg";
import { getSessionSecret } from "./secret";

export const sessionCookie = "eurocars_session";
const shortSessionSeconds = 60 * 60 * 12;
const rememberedSessionSeconds = 60 * 60 * 24 * 30;

export const hashSessionToken = (event: H3Event, token: string) =>
  createHmac("sha256", getSessionSecret(event)).update(token).digest("hex");

export const sessionTokenHashes = (event: H3Event, token: string) => [
  hashSessionToken(event, token),
  createHash("sha256").update(token).digest("hex"),
];

export const createSessionToken = () => randomBytes(32).toString("base64url");

export const setSessionCookie = (event: H3Event, token: string, maxAge: number) => {
  setCookie(event, sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
};

export const clearSessionCookie = (event: H3Event) => deleteCookie(event, sessionCookie, { path: "/" });

export const storeSession = async (
  event: H3Event,
  database: Pool,
  token: string,
  userId: string,
  rememberMe: boolean,
) => {
  const maxAge = rememberMe ? rememberedSessionSeconds : shortSessionSeconds;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await database.query(
    "INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(event, token), userId, expiresAt],
  );

  setSessionCookie(event, token, maxAge);
};

export const revokeSession = async (event: H3Event, database: Pool) => {
  const token = getCookie(event, sessionCookie);
  if (token) {
    await database.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ANY($1::text[]) AND revoked_at IS NULL",
      [sessionTokenHashes(event, token)],
    );
  }
  clearSessionCookie(event);
};

export const getSessionToken = (event: H3Event) => getCookie(event, sessionCookie);
