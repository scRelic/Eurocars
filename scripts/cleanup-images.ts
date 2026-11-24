import { Pool } from "pg";
import { cleanupTemporaryImages } from "../server/services/images/image-cleanup.service.ts";
import { cleanupListingImages } from "../server/services/images/listing-image-cleanup.service.ts";
import { VercelBlobStore } from "../server/services/storage/vercel-blob.service.ts";

const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const batchArg = args.find((arg) => arg.startsWith("--batch-size="));
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--batch-size="))
    || args.filter((arg) => arg.startsWith("--batch-size=")).length > 1) {
    throw new Error("Usage: node scripts/cleanup-images.ts [--batch-size=100] [--apply]");
  }
  const batchSize = batchArg ? Number(batchArg.slice("--batch-size=".length)) : 100;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error("DATABASE_URL is required.");
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (apply && !token?.trim()) throw new Error("BLOB_PRIVATE_READ_WRITE_TOKEN is required with --apply.");
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (apply && !publicToken?.trim()) throw new Error("BLOB_READ_WRITE_TOKEN is required with --apply.");
  const database = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    const store = apply
      ? new VercelBlobStore("private", token!)
      : { deleteImages: async () => { throw new Error("Dry run cannot delete images."); } };
    const publicStore = apply
      ? new VercelBlobStore("public", publicToken!)
      : { deleteImages: async () => { throw new Error("Dry run cannot delete images."); } };
    const results = await cleanupTemporaryImages(database, store, { limit: batchSize, dryRun: !apply, publicStore });
    if (results.length < batchSize) {
      results.push(...await cleanupListingImages(database, { privateStore: store, publicStore }, {
        limit: batchSize - results.length, dryRun: !apply,
      }));
    }
    for (const result of results) console.log(`${result.store} ${result.outcome}: ${result.pathname}`);
    console.log(`${apply ? "Applied" : "Dry run"}: ${results.length} jobs inspected.`);
    if (results.some((result) => result.outcome === "failed")) process.exitCode = 1;
  } finally {
    await database.end();
  }
};

main().catch(() => {
  console.error("Image cleanup failed. Check configuration and database availability.");
  process.exitCode = 1;
});
