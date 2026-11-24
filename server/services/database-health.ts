import type { H3Event } from "h3";
import { queryDatabaseHealth } from "../repositories/database-health";
import { getDatabase } from "../utils/db";

export const checkDatabaseHealth = async (event: H3Event) => {
  try {
    await queryDatabaseHealth(getDatabase(event));
  } catch (error) {
    console.error("Database health check failed.", error instanceof Error ? error.name : "Unknown error");
    throw createError({ statusCode: 503, statusMessage: "Database connection is unavailable." });
  }
};
