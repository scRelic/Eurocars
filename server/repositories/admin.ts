import type { Pool, PoolClient, QueryResultRow } from "pg";

export type AdminListingStatus = "DRAFT" | "PENDING" | "ACTIVE" | "SOLD" | "REJECTED" | "ARCHIVED";
export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type AdminPage = { page: number; limit: number };

export type AdminCarsFilters = AdminPage & {
  search?: string;
  status?: AdminListingStatus;
  country?: string;
  sort: "newest" | "oldest" | "price-asc" | "price-desc" | "year-desc";
};

export type AdminUsersFilters = AdminPage & {
  search?: string;
  status?: AccountStatus;
  role?: "USER" | "ADMIN";
  sort: "newest" | "oldest";
};

export type AdminDealersFilters = AdminPage & {
  search?: string;
  verified?: "VERIFIED" | "UNVERIFIED";
  sort: "newest" | "oldest" | "name-asc";
};

type AdminCarRow = QueryResultRow & {
  id: string;
  title: string;
  brand: string;
  model: string;
  trim: string | null;
  price: string;
  currency: string;
  year: number;
  mileage: number;
  status: AdminListingStatus;
  country: string;
  countryCode: string;
  city: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  views: number;
  imageUrl: string | null;
  images: { id: string; url: string; isPrimary: boolean; position: number }[];
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const carListSelect = `
  SELECT cars.id::text, cars.title, brands.name AS brand, models.name AS model, cars.trim,
         cars.price::text AS price, cars.currency, cars.year, cars.mileage, cars.status,
         countries.name AS country, cars.country_code AS "countryCode", cars.city,
         users.id::text AS "sellerId",
         COALESCE(NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS "sellerName",
         users.email AS "sellerEmail", cars.views,
         (SELECT COALESCE(to_jsonb(car_images)->>'thumbnail_url', image_url) FROM car_images WHERE car_id = cars.id
          ORDER BY is_primary DESC, position, id LIMIT 1) AS "imageUrl",
         COALESCE((SELECT json_agg(json_build_object('id', images.id::text, 'url', COALESCE(to_jsonb(images)->>'gallery_url', images.image_url),
           'isPrimary', images.is_primary, 'position', images.position) ORDER BY images.position, images.id)
           FROM car_images AS images WHERE images.car_id = cars.id), '[]'::json) AS images,
         cars.description,
         cars.created_at AS "createdAt", cars.updated_at AS "updatedAt"
  FROM cars
  JOIN car_brands AS brands ON brands.id = cars.brand_id
  JOIN car_models AS models ON models.id = cars.model_id
  JOIN countries ON countries.code = cars.country_code
  JOIN users ON users.id = cars.seller_id`;

const carDetailSelect = carListSelect.replace(
  "  FROM cars",
  `, cars.fuel_type AS "fuelType", cars.transmission, cars.body_type AS "bodyType",
     cars.condition, cars.engine_capacity_cc AS "engineCapacityCc", cars.power_hp AS "powerHp",
     cars.doors, cars.seats, cars.exterior_color AS "exteriorColor", cars.interior_color AS "interiorColor",
     cars.postal_code AS "postalCode", cars.moderation_reason AS "moderationReason",
     cars.reviewed_by::text AS "reviewedBy", cars.reviewed_at AS "reviewedAt", cars.published_at AS "publishedAt",
     cars.sale_confirmation_status AS "saleConfirmationStatus",
     ARRAY(SELECT features.name FROM car_feature_links AS links
       JOIN car_features AS features ON features.id = links.feature_id
       WHERE links.car_id = cars.id ORDER BY features.name) AS features
  FROM cars`,
);

const pageResult = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const getAdminCars = async (database: Pool, filters: AdminCarsFilters) => {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  const add = (clause: string, value: string) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };
  if (filters.status) add("cars.status = ?", filters.status);
  if (filters.country) add("cars.country_code = ?", filters.country);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`concat_ws(' ', cars.title, brands.name, models.name, users.email, users.first_name, users.last_name) ILIKE $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const from = `FROM cars
    JOIN car_brands AS brands ON brands.id = cars.brand_id
    JOIN car_models AS models ON models.id = cars.model_id
    JOIN users ON users.id = cars.seller_id`;
  const count = await database.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total ${from} ${where}`, values,
  );
  const orders: Record<AdminCarsFilters["sort"], string> = {
    newest: "cars.created_at DESC, cars.id DESC",
    oldest: "cars.created_at ASC, cars.id ASC",
    "price-asc": "cars.price ASC, cars.id DESC",
    "price-desc": "cars.price DESC, cars.id DESC",
    "year-desc": "cars.year DESC, cars.id DESC",
  };
  const result = await database.query<AdminCarRow>(
    `${carListSelect} ${where} ORDER BY ${orders[filters.sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit],
  );
  return pageResult(result.rows.map((row) => ({ ...row, price: Number(row.price) })), Number(count.rows[0]?.total ?? 0), filters.page, filters.limit);
};

export const getPendingSaleConfirmations = async (database: Pool, page: number, limit: number) => {
  const where = "WHERE cars.status = 'SOLD' AND cars.sale_confirmation_status = 'PENDING'";
  const count = await database.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM cars ${where}`);
  const result = await database.query<AdminCarRow>(
    `${carListSelect} ${where}
     ORDER BY cars.updated_at ASC, cars.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit],
  );
  return pageResult(result.rows.map((row) => ({ ...row, price: Number(row.price) })), Number(count.rows[0]?.total ?? 0), page, limit);
};

export const getAdminCar = async (database: Pool, id: string) => {
  const result = await database.query<AdminCarRow & QueryResultRow & {
    description: string | null;
    fuelType: string;
    transmission: string;
    bodyType: string | null;
    condition: string;
    engineCapacityCc: number | null;
    powerHp: number | null;
    doors: number | null;
    seats: number | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    postalCode: string | null;
    moderationReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    publishedAt: Date | null;
    images: { id: string; url: string; isPrimary: boolean; position: number }[];
    features: string[];
  }>(
    `${carDetailSelect} WHERE cars.id = $1`,
    [id],
  );
  return result.rows[0] ? { ...result.rows[0], price: Number(result.rows[0].price) } : null;
};

type AdminUserRow = QueryResultRow & {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  accountStatus: AccountStatus;
  countryCode: string | null;
  city: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  listingCount: number;
};

export const getAdminUsers = async (database: Pool, filters: AdminUsersFilters) => {
  const clauses = ["users.deleted_at IS NULL"];
  const values: (string | number)[] = [];
  const add = (clause: string, value: string) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };
  if (filters.status) add("users.account_status = ?", filters.status);
  if (filters.role) add("users.role = ?", filters.role);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`concat_ws(' ', users.email, users.first_name, users.last_name) ILIKE $${values.length}`);
  }
  const where = clauses.join(" AND ");
  const from = `FROM users WHERE ${where}`;
  const count = await database.query<{ total: string }>(`SELECT COUNT(*)::text AS total ${from}`, values);
  const order = filters.sort === "oldest" ? "users.created_at ASC, users.id ASC" : "users.created_at DESC, users.id DESC";
  const result = await database.query<AdminUserRow>(
    `SELECT users.id::text, users.email, users.first_name AS "firstName", users.last_name AS "lastName",
            users.phone, users.avatar_url AS "avatarUrl", users.role, users.account_status AS "accountStatus",
            users.country_code AS "countryCode", users.city, users.email_verified_at AS "emailVerifiedAt",
            users.created_at AS "createdAt", COUNT(cars.id)::int AS "listingCount"
     FROM users LEFT JOIN cars ON cars.seller_id = users.id
     WHERE ${where}
     GROUP BY users.id
     ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit],
  );
  return pageResult(result.rows, Number(count.rows[0]?.total ?? 0), filters.page, filters.limit);
};

export const getAdminUser = async (database: Pool, id: string) => {
  const result = await database.query<AdminUserRow>(
    `SELECT users.id::text, users.email, users.first_name AS "firstName", users.last_name AS "lastName",
            users.phone, users.avatar_url AS "avatarUrl", users.role, users.account_status AS "accountStatus",
            users.country_code AS "countryCode", users.city, users.email_verified_at AS "emailVerifiedAt",
            users.created_at AS "createdAt", COUNT(cars.id)::int AS "listingCount"
     FROM users LEFT JOIN cars ON cars.seller_id = users.id
     WHERE users.id = $1 AND users.deleted_at IS NULL
     GROUP BY users.id`,
    [id],
  );
  return result.rows[0] ?? null;
};

type AdminDealerRow = QueryResultRow & {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  phone: string | null;
  logoUrl: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  address: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerName: string;
  ownerEmail: string;
  listingCount: number;
};

const dealerSelect = `
  SELECT dealers.id::text, dealers.owner_id::text AS "ownerId", dealers.name, dealers.description,
         dealers.website_url AS "websiteUrl", dealers.phone, dealers.logo_url AS "logoUrl",
         countries.name AS country, dealers.country_code AS "countryCode", dealers.city, dealers.address,
         dealers.is_verified AS "isVerified", dealers.created_at AS "createdAt", dealers.updated_at AS "updatedAt",
         COALESCE(NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS "ownerName",
         users.email AS "ownerEmail", COUNT(cars.id)::int AS "listingCount"
  FROM dealers JOIN users ON users.id = dealers.owner_id
  LEFT JOIN countries ON countries.code = dealers.country_code
  LEFT JOIN cars ON cars.dealer_id = dealers.id`;

export const getAdminDealers = async (database: Pool, filters: AdminDealersFilters) => {
  const clauses: string[] = [];
  const values: (string | number | boolean)[] = [];
  const add = (clause: string, value: string | boolean) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };
  if (filters.verified) add("dealers.is_verified = ?", filters.verified === "VERIFIED");
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`concat_ws(' ', dealers.name, users.email, users.first_name, users.last_name, dealers.city) ILIKE $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const count = await database.query<{ total: string }>(
    `SELECT COUNT(DISTINCT dealers.id)::text AS total
     FROM dealers JOIN users ON users.id = dealers.owner_id ${where}`,
    values,
  );
  const orders: Record<AdminDealersFilters["sort"], string> = {
    newest: "dealers.created_at DESC, dealers.id DESC",
    oldest: "dealers.created_at ASC, dealers.id ASC",
    "name-asc": "dealers.name ASC, dealers.id ASC",
  };
  const result = await database.query<AdminDealerRow>(
    `${dealerSelect} ${where}
     GROUP BY dealers.id, users.id, countries.name
     ORDER BY ${orders[filters.sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit],
  );
  return pageResult(result.rows, Number(count.rows[0]?.total ?? 0), filters.page, filters.limit);
};

export const getAdminDealer = async (database: Pool, id: string) => {
  const result = await database.query<AdminDealerRow>(
    `${dealerSelect} WHERE dealers.id = $1 GROUP BY dealers.id, users.id, countries.name`,
    [id],
  );
  return result.rows[0] ?? null;
};

type AuditLogRow = QueryResultRow & {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export const getAdminAuditLogs = async (database: Pool, page: number, limit: number) => {
  const count = await database.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM admin_audit_logs");
  const result = await database.query<AuditLogRow>(
    `SELECT logs.id::text, logs.admin_id::text AS "adminId",
            COALESCE(NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS "adminName",
            users.email AS "adminEmail", logs.action, logs.entity_type AS "entityType",
            logs.entity_id::text AS "entityId", logs.metadata, logs.created_at AS "createdAt"
     FROM admin_audit_logs AS logs JOIN users ON users.id = logs.admin_id
     ORDER BY logs.created_at DESC, logs.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit],
  );
  return pageResult(result.rows, Number(count.rows[0]?.total ?? 0), page, limit);
};

export const appendAuditLog = async (
  client: PoolClient,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) => {
  await client.query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, entityType, entityId, JSON.stringify(metadata)],
  );
};
