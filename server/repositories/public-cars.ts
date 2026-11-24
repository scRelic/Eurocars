import type { Pool, QueryResultRow } from "pg";

export type PublicCarFilters = {
  brand?: string;
  model?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort: "recommended" | "price-asc" | "price-desc" | "year-desc" | "mileage-asc";
  page: number;
  limit: number;
};

export type PublicCar = {
  id: string;
  title: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  price: number;
  currency: string;
  mileage: number;
  country: string;
  city: string;
  fuel: string;
  transmission: string;
  bodyType: string;
  condition: string;
  engine: string;
  power: number | null;
  color: string;
  description: string;
  views: number;
  image: string | null;
  imageThumbnail?: string | null;
  features: string[];
  images: { id: string; url: string; thumbnailUrl?: string | null; catalogUrl?: string | null; isPrimary: boolean }[];
  seller?: { id: string; name: string; avatarUrl: string | null } | null;
  dealer?: { name: string; isVerified: boolean } | null;
  featureGroups?: { name: string; items: string[] }[];
};

type PublicCarRow = QueryResultRow & Omit<PublicCar, "price" | "image" | "engine"> & {
  price: string;
  image: string | null;
  engineCapacityCc: number | null;
};

const selectPublicCars = `
  SELECT c.id::text, c.title, b.name AS make, m.name AS model, COALESCE(c.trim, '') AS trim,
    c.year, c.price::text AS price, c.currency, c.mileage, co.name AS country, c.city,
    c.fuel_type AS fuel, c.transmission, COALESCE(c.body_type, '') AS "bodyType", c.condition,
    c.engine_capacity_cc AS "engineCapacityCc", c.power_hp AS power,
    COALESCE(c.exterior_color, '') AS color, COALESCE(c.description, '') AS description, c.views,
    (SELECT i.image_url FROM car_images i WHERE i.car_id = c.id ORDER BY i.is_primary DESC, i.position, i.id LIMIT 1) AS image,
    (SELECT to_jsonb(i)->>'thumbnail_url' FROM car_images i WHERE i.car_id = c.id ORDER BY i.is_primary DESC, i.position, i.id LIMIT 1) AS "imageThumbnail",
    COALESCE((SELECT json_agg(json_build_object('id', i.id::text, 'url', COALESCE(to_jsonb(i)->>'gallery_url', i.image_url),
      'thumbnailUrl', to_jsonb(i)->>'thumbnail_url', 'catalogUrl', to_jsonb(i)->>'catalog_url', 'isPrimary', i.is_primary)
      ORDER BY i.position, i.id) FROM car_images i WHERE i.car_id = c.id), '[]'::json) AS images,
    ARRAY(SELECT f.name FROM car_feature_links l JOIN car_features f ON f.id = l.feature_id
      WHERE l.car_id = c.id ORDER BY f.name) AS features,
    CASE WHEN d.id IS NOT NULL THEN json_build_object('name', d.name, 'isVerified', d.is_verified) ELSE NULL END AS dealer
  FROM cars c
  JOIN car_brands b ON b.id = c.brand_id
  JOIN car_models m ON m.id = c.model_id
  JOIN countries co ON co.code = c.country_code
  LEFT JOIN dealers d ON d.id = c.dealer_id`;

const mapCar = (row: PublicCarRow): PublicCar => {
  const { engineCapacityCc, ...car } = row;
  return {
    ...car,
    price: Number(row.price),
    engine: engineCapacityCc ? `${(engineCapacityCc / 1000).toFixed(1)} L` : "",
  };
};

export const getPublicCars = async (database: Pool, filters: PublicCarFilters) => {
  const clauses = ["c.status = 'ACTIVE'"];
  const values: (string | number)[] = [];
  const addFilter = (sql: string, value: string | number) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.brand) addFilter("b.name = ?", filters.brand);
  if (filters.model) addFilter("m.name = ?", filters.model);
  if (filters.country) addFilter("co.name = ?", filters.country);
  if (filters.minPrice !== undefined) addFilter("c.price >= ?", filters.minPrice);
  if (filters.maxPrice !== undefined) addFilter("c.price <= ?", filters.maxPrice);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`concat_ws(' ', b.name, m.name, c.trim, c.title, c.city, co.name, c.year::text) ILIKE $${values.length}`);
  }
  const where = clauses.join(" AND ");
  const count = await database.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM cars c
    JOIN car_brands b ON b.id = c.brand_id JOIN car_models m ON m.id = c.model_id
    JOIN countries co ON co.code = c.country_code WHERE ${where}`, values);

  const sortOrder: Record<PublicCarFilters["sort"], string> = {
    recommended: "c.created_at DESC, c.id DESC",
    "price-asc": "c.price ASC, c.id DESC",
    "price-desc": "c.price DESC, c.id DESC",
    "year-desc": "c.year DESC, c.id DESC",
    "mileage-asc": "c.mileage ASC, c.id DESC",
  };
  const offset = (filters.page - 1) * filters.limit;
  const result = await database.query<PublicCarRow>(
    `${selectPublicCars} WHERE ${where} ORDER BY ${sortOrder[filters.sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, offset],
  );
  const total = Number(count.rows[0]?.total ?? 0);
  return {
    items: result.rows.map(mapCar),
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  };
};

export const getPublicCar = async (database: Pool, id: string) => {
  const detailSelect = selectPublicCars.replace(
    "  FROM cars c",
    `, (SELECT json_build_object('id', u.id::text, 'name',
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Seller'),
         'avatarUrl', u.avatar_url) FROM users u WHERE u.id = c.seller_id AND u.deleted_at IS NULL) AS seller,
       COALESCE((SELECT json_agg(json_build_object('name', groups.category, 'items', groups.items) ORDER BY groups.category)
         FROM (SELECT COALESCE(NULLIF(f.category, ''), 'Other') AS category, array_agg(f.name ORDER BY f.name) AS items
           FROM car_feature_links l JOIN car_features f ON f.id = l.feature_id
           WHERE l.car_id = c.id GROUP BY COALESCE(NULLIF(f.category, ''), 'Other')) groups), '[]'::json) AS "featureGroups"
     FROM cars c`,
  );
  const result = await database.query<PublicCarRow>(`${detailSelect} WHERE c.status = 'ACTIVE' AND c.id = $1`, [id]);
  return result.rows[0] ? mapCar(result.rows[0]) : null;
};

export const getFavoriteCars = async (database: Pool, userId: string) => {
  const result = await database.query<PublicCarRow>(
    `${selectPublicCars}
     JOIN favorites favorites ON favorites.car_id = c.id
     WHERE c.status = 'ACTIVE' AND favorites.user_id = $1
     ORDER BY favorites.created_at DESC, c.id DESC`,
    [userId],
  );
  return result.rows.map(mapCar);
};
