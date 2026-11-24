import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireListingUser } from "../../utils/listing-auth";
import { privateBlobToken, readUploadJson, uploadIdSchema } from "../../utils/image-upload-api";
import { issueClientUploadToken } from "../../services/images/client-upload-token.service";
import { UploadSessionError } from "../../services/images/upload-sessions.service";

const schema = z.object({
  type: z.literal("blob.generate-client-token"),
  payload: z.object({
    pathname: z.string().max(512),
    clientPayload: uploadIdSchema,
    multipart: z.literal(false),
  }).strict(),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const parsed = schema.safeParse(await readUploadJson(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid upload request." });
  try {
    const clientToken = await issueClientUploadToken(
      getDatabase(event), user.id, parsed.data.payload.clientPayload, parsed.data.payload.pathname,
      privateBlobToken(), event.node.req,
    );
    setResponseHeader(event, "Cache-Control", "private, no-store");
    return { type: "blob.generate-client-token", clientToken };
  } catch (error) {
    if (error instanceof UploadSessionError) throw createError({ statusCode: 404, statusMessage: "Upload session is unavailable." });
    throw error;
  }
});
