import { getDatabase } from "../utils/db";

export default defineEventHandler(async (event) => {
  const result = await getDatabase(event).query<{ id: string; name: string; category: string }>("SELECT id, name, category FROM car_features ORDER BY category, name");
  return { items: result.rows };
});
