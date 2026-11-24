import { Pool } from "pg";
import type { H3Event } from "h3";

let pool: Pool | undefined;

export const getDatabase = (event: H3Event) => {
  const { databaseUrl } = useRuntimeConfig(event);
  const connectionString = process.env.DATABASE_URL || databaseUrl;

  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database service is unavailable. Configure DATABASE_URL to enable it.",
    });
  }

  if (!pool) {
    pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    pool.on("error", () => {
      console.error("An idle PostgreSQL connection encountered an error.");
    });
  }

  return pool;
};

export const closeDatabase = async () => {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    await activePool.end();
  }
};
