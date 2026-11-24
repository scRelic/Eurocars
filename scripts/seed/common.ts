import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { PoolClient } from "pg";
import { hashPassword } from "../../server/utils/password.ts";

export type RegistryKind = "user" | "dealer" | "car" | "image";
export type Counts = {
  users: number;
  dealers: number;
  cars: number;
  images: number;
  skipped: number;
  failedImages: number;
  originalBytes: number;
  optimizedBytes: number;
  storedBytes: number;
  errors: string[];
};

const userSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  country: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(150),
  email: z.email().endsWith("@example.com"),
}).strict();
const dealerSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  owner: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  country: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(150),
  description: z.string().startsWith("Demo dealership."),
}).strict();
export type DemoUser = z.infer<typeof userSchema>;
export type DemoDealer = z.infer<typeof dealerSchema>;

const readJson = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(`./data/${name}.json`, import.meta.url), "utf8")) as unknown;

export const loadSeedData = async () => {
  const users = z.array(userSchema).length(10).parse(await readJson("users"));
  const dealers = z.array(dealerSchema).length(5).parse(await readJson("dealers"));
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(users.map((u) => u.key)) || !unique(users.map((u) => u.email.toLowerCase()))
    || !unique(dealers.map((d) => d.key)) || !unique(dealers.map((d) => d.name))) {
    throw new Error("Demo user or dealer identifiers are duplicated.");
  }
  for (const dealer of dealers) {
    const owner = users.find((user) => user.key === dealer.owner);
    if (!owner || owner.country !== dealer.country || owner.city !== dealer.city) {
      throw new Error(`Invalid dealer owner: ${dealer.key}.`);
    }
  }
  return { users, dealers, imageSources: await readJson("image-sources") };
};

export const createRegistry = async (client: PoolClient) => {
  await client.query(`CREATE TABLE IF NOT EXISTS eurocars_demo_seed_registry (
    kind TEXT NOT NULL CHECK (kind IN ('user','dealer','car','image')),
    seed_key TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (kind, seed_key),
    UNIQUE (kind, entity_id)
  )`);
};

export const registryId = async (client: PoolClient, kind: RegistryKind, key: string) => {
  const result = await client.query<{ entity_id: string }>(
    "SELECT entity_id::text FROM eurocars_demo_seed_registry WHERE kind=$1 AND seed_key=$2",
    [kind, key],
  );
  return result.rows[0]?.entity_id ?? null;
};

export const register = async (client: PoolClient, kind: RegistryKind, key: string, id: string, metadata: unknown = {}) => {
  await client.query(
    "INSERT INTO eurocars_demo_seed_registry(kind, seed_key, entity_id, metadata) VALUES ($1,$2,$3,$4::jsonb)",
    [kind, key, id, JSON.stringify(metadata)],
  );
};

export const generateDisabledPasswordHash = () => hashPassword(randomBytes(48).toString("base64url"));

export const blobStoreId = (token: string) => {
  const parts = token.split("_");
  const id = parts[3];
  if (parts[0] !== "vercel" || parts[1] !== "blob" || parts[2] !== "rw"
    || !id || !/^[a-zA-Z0-9-]+$/.test(id) || !parts[4]) {
    throw new Error("Invalid demo Blob token format.");
  }
  return id.toLowerCase();
};

export const safeError = (error: unknown) => {
  if (error instanceof Error && error.name === "ZodError") return "Invalid demo data or image manifest.";
  if (error instanceof Error && /^(Demo |Registered demo |Reserved demo |Cannot resolve demo |Ambiguous demo |Invalid demo |Unknown vehicle |Duplicate image |Image file must |Image path leaves |More than five photos |Unsupported image |Processed demo |Operation cancelled|Both Blob|Production confirmation|Cleanup confirmation|Seeder already|Database URL|Invalid arguments|Image synchronization)/.test(error.message)) {
    return error.message;
  }
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && /^[A-Z0-9]{5}$/.test(error.code)) return `Database error ${error.code}.`;
  return "Operation failed. Check database, storage configuration and seed data.";
};
