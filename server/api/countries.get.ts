import { getDatabase } from "../utils/db";

export default defineEventHandler(async (event) => {
  const result = await getDatabase(event).query<{ code: string; name: string }>("SELECT code, name FROM countries ORDER BY name");
  return { items: result.rows };
});
