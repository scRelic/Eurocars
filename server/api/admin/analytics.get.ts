import { z } from "zod";
import { getDatabase } from "../../utils/db";
import { requireAdminUser } from "../../utils/admin-auth";

const querySchema = z.object({ days: z.enum(["7", "30", "90"]).default("30") }).strict();

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Invalid analytics period." });
  const days = Number(parsed.data.days);
  const database = getDatabase(event);
  const [trend, brands, countries, statuses, users, activity, sales] = await Promise.all([
    database.query<{ date: string; listings: number; users: number }>(
      `WITH dates AS (
         SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day')::date AS day
       ), listings AS (
         SELECT created_at::date AS day, COUNT(*)::int AS count FROM cars
         WHERE created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY 1
       ), registrations AS (
         SELECT created_at::date AS day, COUNT(*)::int AS count FROM users
         WHERE deleted_at IS NULL AND created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY 1
       )
       SELECT TO_CHAR(dates.day, 'YYYY-MM-DD') AS date,
         COALESCE(listings.count, 0)::int AS listings, COALESCE(registrations.count, 0)::int AS users
       FROM dates LEFT JOIN listings USING (day) LEFT JOIN registrations USING (day) ORDER BY dates.day`, [days]),
    database.query<{ name: string; count: number }>(
      `SELECT b.name, COUNT(*)::int AS count FROM cars c JOIN car_brands b ON b.id = c.brand_id
       WHERE c.status = 'ACTIVE' GROUP BY b.id, b.name ORDER BY count DESC, b.name LIMIT 5`),
    database.query<{ code: string; name: string; count: number }>(
      `SELECT co.code, co.name, COUNT(*)::int AS count FROM cars c JOIN countries co ON co.code = c.country_code
       WHERE c.status = 'ACTIVE' GROUP BY co.code, co.name ORDER BY count DESC, co.name LIMIT 5`),
    database.query<{ status: string; count: number }>("SELECT status, COUNT(*)::int AS count FROM cars GROUP BY status"),
    database.query<{ id: string; firstName: string | null; lastName: string | null; email: string; role: string; accountStatus: string; createdAt: Date }>(
      `SELECT id::text, first_name AS "firstName", last_name AS "lastName", email, role,
              account_status AS "accountStatus", created_at AS "createdAt"
       FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 5`),
    database.query<{ id: string; kind: string; description: string; createdAt: Date }>(
      `SELECT * FROM (
         (SELECT 'user:' || id::text AS id, 'Registration' AS kind,
                 'New user registered' AS description, created_at AS "createdAt" FROM users WHERE deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT 10)
         UNION ALL
         (SELECT 'car:' || id::text, 'Listing created', title, created_at FROM cars ORDER BY created_at DESC, id DESC LIMIT 10)
         UNION ALL
         (SELECT 'audit:' || id::text, 'Administrative action', REPLACE(action, '_', ' '), created_at
          FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT 10)
       ) events ORDER BY "createdAt" DESC, id DESC LIMIT 10`),
    database.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM cars WHERE status = 'SOLD' AND sale_confirmation_status = 'PENDING'"),
  ]);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return {
    trend: trend.rows, brands: brands.rows, countries: countries.rows, statuses: statuses.rows,
    recentUsers: users.rows, activity: activity.rows, pendingSales: sales.rows[0]?.count ?? 0,
    viewsAvailable: false,
  };
});
