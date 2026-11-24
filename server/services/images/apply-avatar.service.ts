import { randomUUID } from "node:crypto";
import type { GetBlobResult } from "@vercel/blob";
import type { Pool } from "pg";
import type { UserRow } from "../../utils/auth.ts";
import { readUploadedImage } from "./read-uploaded-image.service.ts";
import { UploadSessionError } from "./upload-sessions.service.ts";

type PrivateStore = { getImage(pathname: string, signal?: AbortSignal): Promise<GetBlobResult | null> };
type PublicStore = {
  uploadImage(pathname: string, data: Buffer, contentType: string, signal?: AbortSignal): Promise<{ pathname: string; url: string }>;
  getImageMetadata(pathname: string, signal?: AbortSignal): Promise<{ pathname: string; size: number; contentType: string }>;
  ownsPublicUrl(url: string, pathname: string): boolean;
};
type UploadRow = { status: string; purpose: string; consumed_at: Date | null; consumed_avatar_url: string | null; live: boolean };
type AvatarVariant = { pathname: string; file_size: string; mime_type: string };

const publicAvatarPath = (store: PublicStore, userId: string, url: string | null) => {
  if (!url) return null;
  const prefix = `avatars/${userId}/`;
  let pathname: string;
  try {
    pathname = decodeURI(new URL(url).pathname.slice(1));
  } catch {
    return null;
  }
  if (!pathname.startsWith(prefix)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(pathname.slice(prefix.length))
    || !store.ownsPublicUrl(url, pathname)) return null;
  return pathname;
};

const selectUser = `SELECT id::text, first_name AS "firstName", last_name AS "lastName",
  email, role, phone, avatar_url AS "avatarUrl", country_code AS "countryCode", city, created_at AS "createdAt"
  FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`;

export const applyAvatarUpload = async (
  database: Pool,
  privateStore: PrivateStore,
  publicStore: PublicStore,
  userId: string,
  uploadId: string,
  expectedAvatarUrl?: string,
): Promise<UserRow> => {
  const client = await database.connect();
  const pathname = `avatars/${userId}/${randomUUID()}.webp`;
  try {
    await client.query("BEGIN");
    const preflight = await client.query<UploadRow>(
      `SELECT status, purpose, consumed_at, consumed_avatar_url, expires_at > NOW() AS live
       FROM image_uploads WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [uploadId, userId],
    );
    const upload = preflight.rows[0];
    if (!upload || upload.purpose !== "AVATAR" || upload.status !== "READY" || (!upload.consumed_at && !upload.live)) {
      throw new UploadSessionError("Upload session is unavailable.");
    }
    if (upload.consumed_at) {
      const current = await client.query<UserRow>(selectUser, [userId]);
      if (!current.rows[0] || current.rows[0].avatarUrl !== upload.consumed_avatar_url) {
        throw new UploadSessionError("Upload session has already been used.");
      }
      await client.query("COMMIT");
      return current.rows[0];
    }
    await client.query(
      `INSERT INTO image_delete_jobs (store, pathname, next_attempt_at)
       VALUES ('PUBLIC', $1, NOW() + INTERVAL '1 hour')`,
      [pathname],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const finalClient = await database.connect();
  try {
    await finalClient.query("BEGIN");
    const locked = await finalClient.query<UploadRow>(
      `SELECT status, purpose, consumed_at, consumed_avatar_url, expires_at > NOW() AS live
       FROM image_uploads WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [uploadId, userId],
    );
    const upload = locked.rows[0];
    if (!upload || upload.status !== "READY" || upload.purpose !== "AVATAR" || (!upload.consumed_at && !upload.live)) {
      throw new UploadSessionError("Upload session is unavailable.");
    }
    await finalClient.query("SELECT pg_advisory_xact_lock(hashtextextended('avatar-reference', 0))");
    const userResult = await finalClient.query<UserRow>(selectUser, [userId]);
    const user = userResult.rows[0];
    if (!user) throw new UploadSessionError("Account is unavailable.");
    if (upload.consumed_at) {
      if (user.avatarUrl !== upload.consumed_avatar_url) throw new UploadSessionError("Upload session has already been used.");
      await finalClient.query("COMMIT");
      return user;
    }
    if (expectedAvatarUrl !== undefined && user.avatarUrl !== expectedAvatarUrl) {
      throw new UploadSessionError("The avatar changed during migration.");
    }
    const variants = await finalClient.query<AvatarVariant>(
      `SELECT pathname, file_size::text, mime_type FROM image_upload_variants
       WHERE upload_id = $1 AND variant = 'avatar'`,
      [uploadId],
    );
    const variant = variants.rows[0];
    if (!variant) throw new UploadSessionError("Processed avatar is unavailable.");
    const signal = AbortSignal.timeout(25_000);
    const image = await readUploadedImage(privateStore, variant.pathname, Number(variant.file_size), variant.mime_type, signal);
    const saved = await publicStore.uploadImage(pathname, image, variant.mime_type, signal);
    if (saved.pathname !== pathname || !publicStore.ownsPublicUrl(saved.url, pathname)) {
      throw new Error("Public avatar location does not match.");
    }
    const metadata = await publicStore.getImageMetadata(pathname, signal);
    if (metadata.pathname !== pathname || metadata.size !== image.length || metadata.contentType !== variant.mime_type) {
      throw new Error("Public avatar metadata does not match.");
    }
    const updated = await finalClient.query<UserRow>(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2
       RETURNING id::text, first_name AS "firstName", last_name AS "lastName", email, role, phone,
         avatar_url AS "avatarUrl", country_code AS "countryCode", city, created_at AS "createdAt"`,
      [saved.url, userId],
    );
    const previousPath = publicAvatarPath(publicStore, userId, user.avatarUrl);
    if (previousPath) {
      await finalClient.query(
        `INSERT INTO image_delete_jobs (store, pathname) VALUES ('PUBLIC', $1)
         ON CONFLICT (store, pathname) DO UPDATE SET next_attempt_at = LEAST(image_delete_jobs.next_attempt_at, NOW())`,
        [previousPath],
      );
    }
    await finalClient.query(
      `UPDATE image_uploads SET consumed_at = NOW(), consumed_avatar_url = $1 WHERE id = $2`,
      [saved.url, uploadId],
    );
    await finalClient.query("DELETE FROM image_upload_variants WHERE upload_id = $1", [uploadId]);
    await finalClient.query("COMMIT");
    if (!updated.rows[0]) throw new Error("Unable to load the updated account.");
    return updated.rows[0];
  } catch (error) {
    await finalClient.query("ROLLBACK");
    throw error;
  } finally {
    finalClient.release();
  }
};
