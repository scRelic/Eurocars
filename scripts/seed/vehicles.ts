import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { PoolClient } from "pg";
import { register, registryId } from "./common.ts";
import type { Counts } from "./common.ts";

const vehicleSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  brand: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().min(1),
  year: z.number().int().min(1886).max(2100),
  price: z.number().int().positive(),
  mileage: z.number().int().nonnegative(),
  fuel: z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]),
  engineCc: z.number().int().positive().nullable(),
  powerHp: z.number().int().positive(),
  drivetrain: z.enum(["FWD", "RWD", "AWD"]),
  body: z.enum(["SEDAN", "SUV", "HATCHBACK", "WAGON", "COUPE"]),
  doors: z.number().int().min(1).max(8),
  seats: z.number().int().min(1).max(20),
}).strict().refine((value) => (value.fuel === "ELECTRIC") === (value.engineCc === null), {
  message: "Only electric vehicles omit engine displacement.",
});

export type DemoVehicle = z.infer<typeof vehicleSchema> & {
  sellerKey: string;
  dealerKey: string | null;
  title: string;
  description: string;
  currency: "EUR";
  transmission: "AUTOMATIC";
  condition: "USED";
  exteriorColor: string;
  interiorColor: string;
  status: "ACTIVE" | "PENDING" | "ARCHIVED" | "SOLD";
  features: string[];
};

const sellers = [
  "de-munich", "de-berlin", "nl-amsterdam", "it-milan", "pl-warsaw",
  "fr-paris", "fr-lyon", "be-brussels", "at-vienna", "pl-krakow",
] as const;
const dealerships = ["munich-performance", "berlin-gallery", "amsterdam-premium", "milano-luxury", "warsaw-select"] as const;
const colors = ["Metallic Grey", "Pearl White", "Deep Blue", "Jet Black", "Silver"] as const;

export const prepareDemoVehicles = (input: unknown): DemoVehicle[] => {
  const items = z.array(vehicleSchema).length(50).parse(input);
  if (new Set(items.map((item) => item.key)).size !== items.length) {
    throw new Error("Demo vehicle keys must be unique.");
  }
  return items.map((item, index) => {
    const sellerIndex = index % sellers.length;
    const sellerKey = sellers[sellerIndex]!;
    const dealerKey = dealerships[sellerIndex] ?? null;
    const title = `Demo Listing: ${item.brand} ${item.model} ${item.trim}`;
    const exteriorColor = colors[index % colors.length]!;
    const status = index < 40 ? "ACTIVE" : index < 45 ? "PENDING" : index < 48 ? "ARCHIVED" : "SOLD";
    return {
      ...item, sellerKey, dealerKey, title, currency: "EUR", transmission: "AUTOMATIC", condition: "USED",
      exteriorColor, interiorColor: "Black", status,
      features: ["Air conditioning", "Bluetooth"],
      description: `Demo Listing: This fictional ${item.year} ${item.brand} ${item.model} ${item.trim} is presented in ${exteriorColor} with a black interior and ${item.drivetrain} drivetrain. The stated mileage is ${item.mileage.toLocaleString("en-GB")} km. This is sample inventory, not a vehicle offered for sale.`,
    };
  });
};

export const loadDemoVehicles = async () => {
  const path = fileURLToPath(new URL("./data/vehicles.json", import.meta.url));
  return prepareDemoVehicles(JSON.parse(await readFile(path, "utf8")) as unknown);
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const seedVehicles = async (client: PoolClient, vehicles: DemoVehicle[], counts: Counts) => {
  for (const [name, category] of [["Air conditioning", "Comfort"], ["Bluetooth", "Technology"]] as const) {
    await client.query("INSERT INTO car_features(name,category) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", [name, category]);
  }
  for (const vehicle of vehicles) {
    const sellerId = await registryId(client, "user", vehicle.sellerKey);
    if (!sellerId) throw new Error(`Demo seller is missing: ${vehicle.sellerKey}.`);
    const dealerId = vehicle.dealerKey ? await registryId(client, "dealer", vehicle.dealerKey) : null;
    if (vehicle.dealerKey && !dealerId) throw new Error(`Demo dealer is missing: ${vehicle.dealerKey}.`);
    const existing = await registryId(client, "car", vehicle.key);
    if (existing) {
      const verified = await client.query(
        "SELECT id FROM cars WHERE id=$1 AND seller_id=$2 AND title LIKE 'Demo Listing:%'",
        [existing, sellerId],
      );
      if (!verified.rowCount) throw new Error(`Registered demo listing changed: ${vehicle.key}.`);
      counts.skipped++;
      continue;
    }
    await client.query("INSERT INTO car_brands(name,slug) VALUES ($1,$2) ON CONFLICT DO NOTHING", [vehicle.brand, slug(vehicle.brand)]);
    const brand = await client.query<{ id: string }>("SELECT id::text FROM car_brands WHERE name=$1", [vehicle.brand]);
    const brandId = brand.rows[0]?.id;
    if (!brandId) throw new Error(`Cannot resolve demo brand: ${vehicle.brand}.`);
    const modelRows = await client.query<{ id: string }>(
      "SELECT id::text FROM car_models WHERE brand_id=$1 AND name=$2", [brandId, vehicle.model],
    );
    if (modelRows.rows.length > 1) throw new Error(`Ambiguous demo model: ${vehicle.key}.`);
    let modelId = modelRows.rows[0]?.id;
    if (!modelId) {
      await client.query(
        "INSERT INTO car_models(brand_id,name,slug) VALUES ($1,$2,$3) ON CONFLICT (brand_id,slug) DO NOTHING",
        [brandId, vehicle.model, slug(vehicle.model)],
      );
      const found = await client.query<{ id: string }>(
        "SELECT id::text FROM car_models WHERE brand_id=$1 AND name=$2", [brandId, vehicle.model],
      );
      modelId = found.rows[0]?.id;
    }
    if (!modelId) throw new Error(`Cannot resolve demo model: ${vehicle.key}.`);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO cars(seller_id,dealer_id,brand_id,model_id,title,trim,description,price,currency,year,mileage,
        fuel_type,transmission,body_type,condition,engine_capacity_cc,power_hp,doors,seats,exterior_color,interior_color,
        country_code,city,status,published_at,sale_confirmation_status)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        u.country_code,u.city,$22::varchar,CASE WHEN $22::varchar='ACTIVE' THEN NOW() ELSE NULL END,
        CASE WHEN $22::varchar='SOLD' THEN 'CONFIRMED' ELSE 'NOT_REQUESTED' END
       FROM users u WHERE u.id=$1 RETURNING id::text`,
      [sellerId, dealerId, brandId, modelId, vehicle.title, vehicle.trim, vehicle.description,
        vehicle.price, vehicle.currency, vehicle.year, vehicle.mileage, vehicle.fuel, vehicle.transmission,
        vehicle.body, vehicle.condition, vehicle.engineCc, vehicle.powerHp, vehicle.doors, vehicle.seats,
        vehicle.exteriorColor, vehicle.interiorColor, vehicle.status],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error(`Demo listing insert failed: ${vehicle.key}.`);
    await client.query(
      "INSERT INTO car_feature_links(car_id,feature_id) SELECT $1,id FROM car_features WHERE name=ANY($2::text[]) ON CONFLICT DO NOTHING",
      [id, vehicle.features],
    );
    await register(client, "car", vehicle.key, id, { title: vehicle.title, description: vehicle.description, status: vehicle.status, sellerId });
    counts.cars++;
  }
};
