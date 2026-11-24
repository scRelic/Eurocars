import { getDatabase } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const result = await getDatabase(event).query<{ id: string; name: string }>("SELECT id, name FROM car_brands ORDER BY name");
  return { items: result.rows };
});
