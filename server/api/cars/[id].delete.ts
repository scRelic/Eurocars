import { getDatabase } from "../../utils/db";
import { listingId, requireListingUser } from "../../utils/listing-auth";
import { changeListing } from "../../services/listings";

export default defineEventHandler(async (event) => {
  const user = await requireListingUser(event);
  const id = listingId(getRouterParam(event, "id"));
  await changeListing(getDatabase(event), user.id, id, { status: "ARCHIVED" });
  return { success: true };
});
