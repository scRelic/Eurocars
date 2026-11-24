import { getDatabase } from "../../../../utils/db";
import { listingId, requireListingUser } from "../../../../utils/listing-auth";
import { getOwnListing } from "../../../../repositories/listings";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const id = listingId(getRouterParam(event, "id"));
  const listing = await getOwnListing(getDatabase(event), user.id, id);
  if (!listing) throw createError({ statusCode: 404, statusMessage: "Listing not found." });
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { listing };
});
