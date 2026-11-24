import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireListingUser } from "../../utils/listing-auth";
import { privateBlobToken, readUploadJson } from "../../utils/image-upload-api";
import { prepareUploadSession, UploadSessionError } from "../../services/images/upload-sessions.service";

const schema = z.object({
  purpose: z.enum(["LISTING", "AVATAR"]),
  size: z.number().int().positive(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  privateBlobToken();
  const parsed = schema.safeParse(await readUploadJson(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid image upload details." });
  try {
    const session = await prepareUploadSession(getDatabase(event), user.id, parsed.data.purpose, parsed.data.size, parsed.data.contentType);
    setResponseHeader(event, "Cache-Control", "private, no-store");
    return session;
  } catch (error) {
    if (error instanceof UploadSessionError) throw createError({ statusCode: 400, statusMessage: error.message });
    throw error;
  }
});
