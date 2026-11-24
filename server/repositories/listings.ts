import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { Listing, ListingInput, ListingStatus } from "../../shared/types/listing";

type ListingRow = QueryResultRow & Omit<Listing, "price" | "trim" | "description" | "exteriorColor" | "interiorColor" | "postalCode"> & {
  price: string;
  trim: string | null;
  description: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  postalCode: string | null;
};

const selectListing = `
  SELECT c.id, c.brand_id AS "brandId", c.model_id AS "modelId", c.dealer_id AS "dealerId",
    b.name AS "brandName", m.name AS "modelName", c.title, c.trim, c.description, c.price, c.currency,
    c.year, c.mileage, c.fuel_type AS "fuelType", c.transmission, c.body_type AS "bodyType",
    c.condition, c.engine_capacity_cc AS "engineCapacityCc", c.power_hp AS "powerHp",
    c.doors, c.seats, to_char(c.first_registration, 'YYYY-MM-DD') AS "firstRegistration",
    c.exterior_color AS "exteriorColor", c.interior_color AS "interiorColor",
    c.country_code AS "countryCode", c.city, c.postal_code AS "postalCode", c.status, c.views,
    c.sale_confirmation_status AS "saleConfirmationStatus",
    c.sale_confirmation_reason AS "saleConfirmationReason",
    (SELECT i.image_url FROM car_images i WHERE i.car_id = c.id ORDER BY i.is_primary DESC, i.position, i.id LIMIT 1) AS "imageUrl",
    COALESCE((SELECT json_agg(json_build_object('id', i.id::text, 'url', COALESCE(to_jsonb(i)->>'gallery_url', i.image_url), 'isPrimary', i.is_primary)
      ORDER BY i.position, i.id) FROM car_images i WHERE i.car_id = c.id), '[]'::json) AS images,
    ARRAY(SELECT f.feature_id::text FROM car_feature_links f WHERE f.car_id = c.id ORDER BY f.feature_id) AS "featureIds"
  FROM cars c JOIN car_brands b ON b.id = c.brand_id JOIN car_models m ON m.id = c.model_id`;

const mapListing = (row: ListingRow): Listing => ({
  ...row,
  price: Number(row.price),
  trim: row.trim ?? "",
  description: row.description ?? "",
  exteriorColor: row.exteriorColor ?? "",
  interiorColor: row.interiorColor ?? "",
  postalCode: row.postalCode ?? "",
});

export const getOwnListings = async (database: Pool, userId: string) => {
  const result = await database.query<ListingRow>(`${selectListing} WHERE c.seller_id = $1 ORDER BY c.updated_at DESC, c.id DESC`, [userId]);
  return result.rows.map(mapListing);
};

export const getOwnListing = async (database: Pool | PoolClient, userId: string, id: string) => {
  const result = await database.query<ListingRow>(`${selectListing} WHERE c.seller_id = $1 AND c.id = $2`, [userId, id]);
  return result.rows[0] ? mapListing(result.rows[0]) : null;
};

export const validateReferences = async (client: PoolClient, userId: string, listing: ListingInput) => {
  const result = await client.query<{ model_ok: boolean; country_ok: boolean; dealer_ok: boolean; features_ok: boolean }>(
    `SELECT
      EXISTS (SELECT 1 FROM car_models WHERE id = $1 AND brand_id = $2) AS model_ok,
      EXISTS (SELECT 1 FROM countries WHERE code = $3) AS country_ok,
      ($4::bigint IS NULL OR EXISTS (SELECT 1 FROM dealers WHERE id = $4 AND owner_id = $5)) AS dealer_ok,
      (SELECT COUNT(*) FROM car_features WHERE id = ANY($6::bigint[])) = cardinality($6::bigint[]) AS features_ok`,
    [listing.modelId, listing.brandId, listing.countryCode, listing.dealerId, userId, listing.featureIds],
  );
  const row = result.rows[0];
  if (!row?.model_ok || !row.country_ok || !row.dealer_ok || !row.features_ok) {
    throw createError({ statusCode: 400, statusMessage: "Check the selected model, country, dealer and features." });
  }
};

const values = (listing: ListingInput) => [
  listing.brandId, listing.modelId, listing.dealerId, listing.title, listing.trim || null,
  listing.description || null, listing.price, listing.currency, listing.year, listing.mileage,
  listing.fuelType, listing.transmission, listing.bodyType, listing.condition,
  listing.engineCapacityCc, listing.powerHp, listing.exteriorColor || null, listing.interiorColor || null,
  listing.countryCode, listing.city, listing.postalCode || null,
];

export const createListing = async (client: PoolClient, userId: string, listing: ListingInput, status: "DRAFT" | "PENDING") => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO cars (brand_id, model_id, dealer_id, title, trim, description, price, currency, year, mileage,
      fuel_type, transmission, body_type, condition, engine_capacity_cc, power_hp, exterior_color, interior_color,
      country_code, city, postal_code, seller_id, status, doors, seats, first_registration)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING id`,
    [...values(listing), userId, status, listing.doors ?? null, listing.seats ?? null, listing.firstRegistration ?? null],
  );
  const id = result.rows[0]!.id;
  await replaceFeatures(client, id, listing.featureIds);
  return id;
};

export const updateListing = async (client: PoolClient, userId: string, id: string, listing: ListingInput, status: ListingStatus) => {
  await client.query(
    `UPDATE cars SET brand_id=$1, model_id=$2, dealer_id=$3, title=$4, trim=$5, description=$6, price=$7,
      currency=$8, year=$9, mileage=$10, fuel_type=$11, transmission=$12, body_type=$13, condition=$14,
      engine_capacity_cc=$15, power_hp=$16, exterior_color=$17, interior_color=$18, country_code=$19,
      city=$20, postal_code=$21, status=$22, updated_at=NOW(),
      sale_confirmation_status='NOT_REQUESTED', sale_confirmation_reason=NULL,
      sale_reviewed_by=NULL, sale_reviewed_at=NULL,
      doors=CASE WHEN $25::boolean THEN $26::smallint ELSE doors END,
      seats=CASE WHEN $27::boolean THEN $28::smallint ELSE seats END,
      first_registration=CASE WHEN $29::boolean THEN $30::date ELSE first_registration END
     WHERE id=$23 AND seller_id=$24`,
    [...values(listing), status, id, userId, listing.doors !== undefined, listing.doors ?? null,
      listing.seats !== undefined, listing.seats ?? null, listing.firstRegistration !== undefined, listing.firstRegistration ?? null],
  );
  await replaceFeatures(client, id, listing.featureIds);
};

const replaceFeatures = async (client: PoolClient, id: string, featureIds: string[]) => {
  await client.query("DELETE FROM car_feature_links WHERE car_id = $1", [id]);
  await client.query("INSERT INTO car_feature_links (car_id, feature_id) SELECT $1, unnest($2::bigint[])", [id, featureIds]);
};
