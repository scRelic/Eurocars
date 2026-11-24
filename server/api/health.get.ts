import { checkDatabaseHealth } from "../services/database-health";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  await checkDatabaseHealth(event);
  return { status: "ok" };
});
