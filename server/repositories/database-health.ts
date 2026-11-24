import type { Pool } from "pg";

export const queryDatabaseHealth = async (database: Pool) => {
  await database.query("SELECT 1");
};
