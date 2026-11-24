import { getDatabase } from "../../utils/db";
import { requireAdminUser } from "../../utils/admin-auth";

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const start = performance.now();
  let database: { status: "Healthy" | "Unavailable"; durationMs: number | null };
  try {
    await getDatabase(event).query("SELECT 1");
    database = { status: "Healthy", durationMs: Math.round(performance.now() - start) };
  } catch {
    console.error("Admin health check: database query failed.");
    database = { status: "Unavailable", durationMs: null };
  }
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return { database, uptimeSeconds: Math.floor(process.uptime()), checkedAt: new Date().toISOString() };
});
