import { getDatabase } from "../../utils/db";
import { requireAdminUser } from "../../utils/admin-auth";
import type { QueryResultRow } from "pg";

type AdminCountsRow = QueryResultRow & {
  totalUsers: string;
  totalListings: string;
  activeListings: string;
  pendingListings: string;
  verifiedDealers: string;
  newUsers: string;
  newListings: string;
};

type ListingTrendRow = QueryResultRow & {
  date: string;
  count: number;
};

type PendingListingRow = QueryResultRow & {
  id: string;
  title: string;
  brand: string;
  model: string;
  price: string;
  currency: string;
  year: number;
  mileage: number;
  country: string;
  city: string;
  sellerName: string;
  sellerEmail: string;
  imageUrl: string | null;
  submittedAt: Date;
};

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const database = await getDatabase(event);
  const [countsResult, trendResult, pendingResult] = await Promise.all([
    database.query<AdminCountsRow>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)::text AS "totalUsers",
         (SELECT COUNT(*) FROM cars)::text AS "totalListings",
         (SELECT COUNT(*) FROM cars WHERE status = 'ACTIVE')::text AS "activeListings",
         (SELECT COUNT(*) FROM cars WHERE status = 'PENDING')::text AS "pendingListings",
         (SELECT COUNT(*) FROM dealers WHERE is_verified = TRUE)::text AS "verifiedDealers",
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days')::text AS "newUsers",
         (SELECT COUNT(*) FROM cars WHERE created_at >= NOW() - INTERVAL '30 days')::text AS "newListings"`,
    ),
    database.query<ListingTrendRow>(
      `SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date, COUNT(cars.id)::int AS count
       FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS days(day)
       LEFT JOIN cars ON cars.created_at >= days.day AND cars.created_at < days.day + INTERVAL '1 day'
       GROUP BY days.day
       ORDER BY days.day`,
    ),
    database.query<PendingListingRow>(
      `SELECT cars.id::text, cars.title, brands.name AS brand, models.name AS model,
              cars.price::text AS price, cars.currency, cars.year, cars.mileage,
              countries.name AS country, cars.city,
              COALESCE(NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS "sellerName",
              users.email AS "sellerEmail",
              (SELECT image_url FROM car_images WHERE car_id = cars.id
               ORDER BY is_primary DESC, position, id LIMIT 1) AS "imageUrl",
              cars.updated_at AS "submittedAt"
       FROM cars
       JOIN car_brands AS brands ON brands.id = cars.brand_id
       JOIN car_models AS models ON models.id = cars.model_id
       JOIN countries ON countries.code = cars.country_code
       JOIN users ON users.id = cars.seller_id
       WHERE cars.status = 'PENDING'
       ORDER BY cars.updated_at DESC, cars.id DESC
       LIMIT 5`,
    ),
  ]);
  const counts = countsResult.rows[0];
  if (!counts) {
    throw createError({ statusCode: 500, statusMessage: "Dashboard statistics could not be calculated." });
  }

  return {
    stats: {
      totalUsers: Number(counts.totalUsers),
      totalListings: Number(counts.totalListings),
      activeListings: Number(counts.activeListings),
      pendingListings: Number(counts.pendingListings),
      verifiedDealers: Number(counts.verifiedDealers),
      newUsers: Number(counts.newUsers),
      newListings: Number(counts.newListings),
    },
    listingTrend: trendResult.rows.map((row) => ({ date: row.date, count: row.count })),
    pendingListings: pendingResult.rows.map((row) => ({
      ...row,
      price: Number(row.price),
      submittedAt: row.submittedAt.toISOString(),
    })),
  };
});
