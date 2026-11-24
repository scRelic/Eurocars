import { getDatabase } from "../../../../utils/db";
import { requireListingUser } from "../../../../utils/listing-auth";
import { getOwnListings } from "../../../../repositories/listings";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { items: await getOwnListings(getDatabase(event), user.id) };
});
