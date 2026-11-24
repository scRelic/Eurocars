import { getDatabase } from "../../utils/db";
import { requireListingUser } from "../../utils/listing-auth";
import { createListingSchema } from "../../validators/listing";
import { addListing } from "../../services/listings";
import { readListingSubmission } from "../../utils/listing-image-upload";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const { body, photos, imageOrder } = await readListingSubmission(event);
  const parsed = createListingSchema.safeParse(body);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check your listing details and try again." });
  const key = z.string().uuid().safeParse(getRequestHeader(event, "idempotency-key"));
  if (!key.success) throw createError({ statusCode: 400, statusMessage: "A valid idempotency key is required." });
  const result = await addListing(getDatabase(event), user.id, parsed.data.listing, parsed.data.status, key.data, photos, imageOrder);
  setResponseStatus(event, result.created ? 201 : 200);
  return { listing: result.listing };
});
