import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireListingUser } from "../../utils/listing-auth";
import { privateBlobToken, readUploadJson, uploadIdSchema } from "../../utils/image-upload-api";
import { completeUploadSession } from "../../services/images/complete-upload.service";
import { ImageProcessingBusyError, ImageValidationError } from "../../services/images/image-processing.service";
import { UploadSessionError } from "../../services/images/upload-sessions.service";
import { VercelBlobStore } from "../../services/storage/vercel-blob.service";

const schema = z.object({ id: uploadIdSchema }).strict();

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const parsed = schema.safeParse(await readUploadJson(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid upload request." });
  try {
    await completeUploadSession(getDatabase(event), new VercelBlobStore("private", privateBlobToken()), user.id, parsed.data.id);
    setResponseHeader(event, "Cache-Control", "private, no-store");
    return { id: parsed.data.id, status: "READY" };
  } catch (error) {
    if (error instanceof UploadSessionError) throw createError({ statusCode: 409, statusMessage: "Upload session is unavailable or still processing." });
    if (error instanceof ImageValidationError) throw createError({ statusCode: 400, statusMessage: "The image is invalid or does not match its declared type." });
    if (error instanceof ImageProcessingBusyError) {
      setResponseHeader(event, "Retry-After", 5);
      throw createError({ statusCode: 503, statusMessage: error.message });
    }
    throw error;
  }
});
