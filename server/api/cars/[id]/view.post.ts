import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const id = listingId(getRouterParam(event, "id"));
  const result = await getDatabase(event).query<{ views: number }>(
    "UPDATE cars SET views = views + 1 WHERE id = $1 AND status = 'ACTIVE' RETURNING views",
    [id],
  );
  if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: "Car not found." });
  setResponseHeader(event, "Cache-Control", "no-store");
  return result.rows[0];
});
