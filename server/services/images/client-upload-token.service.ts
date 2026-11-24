import { handleUpload } from "@vercel/blob/client";
import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import { UploadSessionError } from "./upload-sessions.service.ts";

export const issueClientUploadToken = async (
  database: Pool,
  userId: string,
  sessionId: string,
  pathname: string,
  token: string,
  request: Request | IncomingMessage,
) => {
  if (!/^[1-9]\d{0,18}$/.test(userId) || BigInt(userId) > 9223372036854775807n
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId)
    || pathname !== `temp/${userId}/${sessionId}`) {
    throw new UploadSessionError("Upload session is unavailable.");
  }
  if (!token.trim()) throw new Error("Private Blob token is not configured.");
  const result = await handleUpload({
    request,
    token,
    body: {
      type: "blob.generate-client-token",
      payload: { pathname, multipart: false, clientPayload: sessionId },
    },
    onBeforeGenerateToken: async (requestedPath, payload, multipart) => {
      if (requestedPath !== pathname || payload !== sessionId || multipart) {
        throw new Error("Invalid upload request.");
      }
      const saved = await database.query<{
        expected_file_size: string;
        expected_mime_type: string;
        expires_at: Date;
      }>(
        `UPDATE image_uploads SET status = 'UPLOADING'
         WHERE id = $1 AND user_id = $2 AND temporary_blob_pathname = $3
           AND status IN ('PENDING','UPLOADING') AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING expected_file_size::text, expected_mime_type, expires_at`,
        [sessionId, userId, pathname],
      );
      const session = saved.rows[0];
      if (!session) throw new UploadSessionError("Upload session is unavailable.");
      return {
        allowedContentTypes: [session.expected_mime_type],
        maximumSizeInBytes: Number(session.expected_file_size),
        validUntil: Math.min(session.expires_at.getTime(), Date.now() + 5 * 60 * 1000),
        addRandomSuffix: false,
        allowOverwrite: false,
      };
    },
  });
  if (result.type !== "blob.generate-client-token") throw new Error("Unexpected Blob upload response.");
  return result.clientToken;
};
