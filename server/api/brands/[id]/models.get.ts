import { getDatabase } from "../../../utils/db";
import { listingId } from "../../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const id = listingId(getRouterParam(event, "id"));
  const result = await getDatabase(event).query<{ id: string; name: string }>("SELECT id, name FROM car_models WHERE brand_id = $1 ORDER BY name", [id]);
  return { items: result.rows };
});
