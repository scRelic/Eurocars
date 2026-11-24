import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Pool } from "pg";
import { VercelBlobStore } from "../../server/services/storage/vercel-blob.service.ts";
import { cleanupDemo, showCleanupPlan } from "./cleanup.ts";
import { blobStoreId, createRegistry, loadSeedData, safeError } from "./common.ts";
import type { Counts } from "./common.ts";
import { seedDealers } from "./dealers.ts";
import { missingImageCounts, prepareDemoImage, seedImages, validateImageSources } from "./images.ts";
import { seedUsers } from "./users.ts";
import { loadDemoVehicles, seedVehicles } from "./vehicles.ts";

type Phase = "all" | "users" | "cars" | "images" | "cleanup";
type Target = "dev" | "prod";

const parseArgs = (args: string[]) => {
  const options = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--apply" || arg === "--dry-run") {
      if (options.has("mode")) throw new Error("Invalid arguments: duplicate mode.");
      options.set("mode", arg);
      apply = arg === "--apply";
      continue;
    }
    const match = /^--(target|phase|limit|max-photos|photo-offset)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error("Invalid arguments.");
    const key = match[1]!;
    const value = match[2] ?? args[++index];
    if (!value || options.has(key)) throw new Error("Invalid arguments.");
    options.set(key, value);
  }
  const target = options.get("target") ?? "dev";
  const phase = options.get("phase") ?? "all";
  const positive = (key: string, fallback: number, max: number) => {
    const raw = options.get(key);
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw)) throw new Error(`Invalid arguments: ${key}.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > max) throw new Error(`Invalid arguments: ${key}.`);
    return value;
  };
  if (!["dev", "prod"].includes(target) || !["all", "users", "cars", "images", "cleanup"].includes(phase)) {
    throw new Error("Invalid arguments.");
  }
  const rawOffset = options.get("photo-offset") ?? "0";
  if (!/^(0|[1-9]\d*)$/.test(rawOffset) || Number(rawOffset) > 250) throw new Error("Invalid arguments: photo-offset.");
  return { target: target as Target, phase: phase as Phase, apply,
    limit: positive("limit", 50, 50), maxPhotos: positive("max-photos", 250, 250), photoOffset: Number(rawOffset) };
};

const confirmation = async (expected: string, message: string) => {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Operation cancelled: confirmation requires an interactive terminal.");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`${message} Type ${expected}: `);
    if (answer !== expected) throw new Error("Operation cancelled.");
  } finally {
    prompt.close();
  }
};

const storeLabel = (token: string | undefined) => token?.trim()
  ? `configured (store ${blobStoreId(token)})`
  : "not configured";

const outputReport = (counts: Counts, missing: ReturnType<typeof missingImageCounts>, apply: boolean, cleanup: boolean) => {
  const prefix = cleanup ? "Deleted" : apply ? "Created" : "Planned";
  console.log(`${prefix} Users: ${counts.users}`);
  console.log(`${prefix} Dealerships: ${counts.dealers}`);
  console.log(`${prefix} Vehicles: ${counts.cars}`);
  console.log(`${cleanup ? "Queued images" : apply ? "Uploaded Images" : "Planned Images"}: ${counts.images}`);
  console.log(`Skipped Records: ${counts.skipped}`);
  console.log(`Failed Images: ${counts.failedImages}`);
  console.log(`Original Bytes: ${counts.originalBytes}`);
  console.log(`Optimized Bytes: ${counts.optimizedBytes}`);
  console.log(`Total Storage Used: not measured; ${apply ? "estimated bytes uploaded this run" : "estimated maximum Blob bytes"}: ${counts.storedBytes}`);
  console.log(`Compression Ratio: ${counts.originalBytes ? (counts.optimizedBytes / counts.originalBytes * 100).toFixed(2) + "%" : "n/a"}`);
  console.log(`Missing Images: ${missing.reduce((total, item) => total + item.missing, 0)}`);
  for (const item of missing) console.log(`  ${item.key}: ${item.available}/3 minimum`);
  console.log(`Errors: ${counts.errors.length}`);
  for (const error of counts.errors) console.error(`  ${error}`);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = options.target === "prod" ? process.env.NUXT_DATABASE_URL_PROD : process.env.NUXT_DATABASE_URL_DEV;
  if (!connectionString?.trim()) throw new Error(`Database URL for ${options.target} is missing.`);
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error("Database URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error("Database URL is invalid.");
  }
  const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  console.log(`Target: ${options.target}; database host: ${url.hostname}; database: ${url.pathname.slice(1)}`);
  console.log(`Blob private: ${storeLabel(privateToken)}; public: ${storeLabel(publicToken)}`);
  console.log(`Mode: ${options.apply ? "WRITE" : "DRY-RUN"}; phase: ${options.phase}; vehicle limit: ${options.limit}; photo offset: ${options.photoOffset}; photo limit: ${options.maxPhotos}`);
  const { users, dealers, imageSources } = await loadSeedData();
  const allVehicles = await loadDemoVehicles();
  const keys = new Set(allVehicles.map((vehicle) => vehicle.key));
  for (const vehicle of allVehicles) {
    if (!users.some((user) => user.key === vehicle.sellerKey)
      || (vehicle.dealerKey && !dealers.some((dealer) => dealer.key === vehicle.dealerKey && dealer.owner === vehicle.sellerKey))) {
      throw new Error("Invalid demo seller or dealership relationship.");
    }
  }
  const vehicles = allVehicles.slice(0, options.limit);
  const selectedKeys = new Set(vehicles.map((vehicle) => vehicle.key));
  const availableSources = validateImageSources(imageSources, keys).filter((source) => selectedKeys.has(source.vehicleKey));
  const sources = availableSources.slice(options.photoOffset, options.photoOffset + options.maxPhotos);
  const missing = missingImageCounts(selectedKeys, availableSources);
  const counts: Counts = { users: 0, dealers: 0, cars: 0, images: 0, skipped: 0, failedImages: 0,
    originalBytes: 0, optimizedBytes: 0, storedBytes: 0, errors: [] };
  const database = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  const client = await database.connect().catch(async (error: unknown) => {
    await database.end();
    throw error;
  });
  let locked = false;
  let transaction = false;
  try {
    const registry = await client.query<{ present: boolean }>("SELECT to_regclass('eurocars_demo_seed_registry') IS NOT NULL AS present");
    if (options.phase === "cleanup") await showCleanupPlan(client, options.limit);
    if (options.phase === "all" || options.phase === "images") {
      let estimate = 0;
      const imageHashes = new Set<string>();
      for (const source of sources) {
        try {
          const prepared = await prepareDemoImage(source);
          const imageKey = `${source.vehicleKey}:${prepared.sha256}`;
          if (imageHashes.has(imageKey)) throw new Error("Duplicate image content for one vehicle.");
          imageHashes.add(imageKey);
          if (!options.apply) {
            counts.images++;
            counts.originalBytes += prepared.sourceBytes;
            counts.optimizedBytes += prepared.optimizedBytes;
          }
          estimate += prepared.optimizedBytes * 3;
          console.log(`Image ${source.vehicleKey}/${source.file}: ${prepared.sourceBytes} -> ${prepared.optimizedBytes} bytes (3 variants).`);
        } catch (error) {
          counts.failedImages++;
          counts.errors.push(`Image ${source.vehicleKey}/${source.file}: ${safeError(error)}`);
        }
      }
      console.log(`Estimated maximum Blob bytes for selected images: ${estimate} (temporary, private and public variants).`);
      if (!options.apply) counts.storedBytes = estimate;
      if (counts.failedImages) {
        outputReport(counts, missing, false, false);
        process.exitCode = 1;
        return;
      }
    }
    if (!options.apply) {
      if (options.phase === "all" || options.phase === "users" || options.phase === "cars") {
        counts.users = users.length;
        if (options.phase !== "users") { counts.dealers = dealers.length; counts.cars = vehicles.length; }
      }
      console.log(registry.rows[0]?.present ? "Registry exists; planned counts include already-created records." : "Registry does not yet exist.");
      outputReport(counts, missing, false, options.phase === "cleanup");
      if (counts.failedImages) process.exitCode = 1;
      return;
    }
    if ((options.phase === "all" || options.phase === "images") && sources.length
      && (!privateToken?.trim() || !publicToken?.trim())) throw new Error("Both Blob tokens are required for image uploads.");
    let storeIds: { privateId: string; publicId: string } | null = null;
    if (privateToken?.trim() && publicToken?.trim()) {
      storeIds = { privateId: blobStoreId(privateToken), publicId: blobStoreId(publicToken) };
      if (storeIds.privateId === storeIds.publicId) throw new Error("Invalid demo Blob configuration: stores must be separate.");
    }
    let hasTrackedImages = false;
    if (options.phase === "cleanup" && registry.rows[0]?.present) {
      const images = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM eurocars_demo_seed_registry WHERE kind='image'");
      hasTrackedImages = Number(images.rows[0]?.count) > 0;
      if (hasTrackedImages) {
        if (!storeIds) throw new Error("Both Blob tokens are required to clean up demo images.");
        const mismatch = await client.query(
          `SELECT 1 FROM eurocars_demo_seed_registry WHERE kind='image'
           AND (metadata->>'privateStoreId' IS DISTINCT FROM $1 OR metadata->>'publicStoreId' IS DISTINCT FROM $2) LIMIT 1`,
          [storeIds.privateId, storeIds.publicId],
        );
        if (mismatch.rowCount) throw new Error("Invalid demo Blob configuration: image stores do not match.");
      }
    }
    const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
    if (options.target === "prod" || !isLocal || hasTrackedImages
      || (sources.length > 0 && (options.phase === "all" || options.phase === "images"))) {
      await confirmation("PRODUCTION", "Remote database or Blob write.");
    } else {
      await confirmation("WRITE", "Local database write.");
    }
    if (options.phase === "cleanup") await confirmation("DELETE DEMO", "Delete eligible tracked demo records and queue their image deletion.");
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended('eurocars-demo-seeder-v1',0)) AS locked");
    locked = !!lock.rows[0]?.locked;
    if (!locked) throw new Error("Seeder already running for this database.");
    if (options.phase === "images" && !registry.rows[0]?.present) throw new Error("Demo registry is missing; create demo cars first.");
    if (options.phase === "cleanup" && !registry.rows[0]?.present) {
      outputReport(counts, missing, true, true);
      return;
    }
    if (options.phase !== "images") {
      await client.query("BEGIN");
      transaction = true;
      if (options.phase === "cleanup") {
        await cleanupDemo(client, users, dealers, counts, options.limit);
      } else {
        await createRegistry(client);
        await seedUsers(client, users, counts);
        if (options.phase !== "users") {
          await seedDealers(client, dealers, counts);
          await seedVehicles(client, vehicles, counts);
        }
      }
      await client.query("COMMIT");
      transaction = false;
    }
    if ((options.phase === "all" || options.phase === "images") && sources.length && privateToken && publicToken && storeIds) {
      await seedImages(database, sources, {
        privateStore: new VercelBlobStore("private", privateToken),
        publicStore: new VercelBlobStore("public", publicToken),
      }, storeIds, counts);
    }
    outputReport(counts, missing, true, options.phase === "cleanup");
    if (counts.failedImages) process.exitCode = 1;
  } catch (error) {
    if (transaction) {
      await client.query("ROLLBACK");
      counts.users = 0;
      counts.dealers = 0;
      counts.cars = 0;
      counts.images = 0;
    }
    counts.errors.push(safeError(error));
    outputReport(counts, missing, options.apply, options.phase === "cleanup");
    process.exitCode = 1;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('eurocars-demo-seeder-v1',0))");
    } finally {
      client.release();
      await database.end();
    }
  }
};

main().catch((error: unknown) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
