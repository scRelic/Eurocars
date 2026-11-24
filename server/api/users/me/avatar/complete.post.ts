import { z } from "zod";
import { getAuthenticatedUser, toAuthUser } from "../../../../utils/auth";
import { getDatabase } from "../../../../utils/db";
import { privateBlobToken, readUploadJson, uploadIdSchema } from "../../../../utils/image-upload-api";
import { applyAvatarUpload } from "../../../../services/images/apply-avatar.service";
import { UploadSessionError } from "../../../../services/images/upload-sessions.service";
import { VercelBlobStore } from "../../../../services/storage/vercel-blob.service";

const schema = z.object({ id: uploadIdSchema }).strict();

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: "Sign in to update your profile photo." });
  const parsed = schema.safeParse(await readUploadJson(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid upload request." });
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!publicToken?.trim()) throw createError({ statusCode: 503, statusMessage: "Image storage is unavailable." });
  try {
    const row = await applyAvatarUpload(
      getDatabase(event), new VercelBlobStore("private", privateBlobToken()),
      new VercelBlobStore("public", publicToken), user.id, parsed.data.id,
    );
    setResponseHeader(event, "Cache-Control", "private, no-store");
    return { user: toAuthUser(row) };
  } catch (error) {
    if (error instanceof UploadSessionError) throw createError({ statusCode: 409, statusMessage: "Upload session is unavailable or has already been used." });
    throw error;
  }
});
