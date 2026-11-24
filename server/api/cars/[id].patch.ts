import { getDatabase } from "../../utils/db";
import { listingId, requireListingUser } from "../../utils/listing-auth";
import { updateListingSchema } from "../../validators/listing";
import { changeListing } from "../../services/listings";
import { readListingSubmission } from "../../utils/listing-image-upload";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const { body, photos, imageOrder } = await readListingSubmission(event);
  const parsed = updateListingSchema.safeParse(body);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Check your listing details and try again." });
  return { listing: await changeListing(getDatabase(event), user.id, id, { ...parsed.data, photos, imageOrder }) };
});
