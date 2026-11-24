import { Pool } from "pg";
import { syncListingImage } from "../server/services/images/sync-listing-image.service.ts";
import { VercelBlobStore } from "../server/services/storage/vercel-blob.service.ts";

const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const batchArg = args.find((arg) => arg.startsWith("--batch-size="));
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--batch-size="))
    || args.filter((arg) => arg.startsWith("--batch-size=")).length > 1) {
    throw new Error("Usage: node scripts/sync-listing-images.ts [--batch-size=20] [--apply]");
  }
  const limit = batchArg ? Number(batchArg.slice("--batch-size=".length)) : 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid batch size.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error("DATABASE_URL is required.");
  const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (apply && (!privateToken?.trim() || !publicToken?.trim())) throw new Error("Both Blob tokens are required with --apply.");
  const database = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    const jobs = await database.query<{ image_id: string }>(
      "SELECT image_id::text FROM image_sync_jobs WHERE next_attempt_at <= NOW() ORDER BY next_attempt_at, image_id LIMIT $1",
      [limit],
    );
    if (!apply) {
      for (const job of jobs.rows) console.log(`would-sync: image ${job.image_id}`);
      console.log(`Dry run: ${jobs.rowCount} jobs inspected.`);
      return;
    }
    const privateStore = new VercelBlobStore("private", privateToken!);
    const publicStore = new VercelBlobStore("public", publicToken!);
    for (const job of jobs.rows) {
      try {
        const processed = await syncListingImage(database, privateStore, publicStore, job.image_id);
        console.log(`${processed ? "processed" : "skipped"}: image ${job.image_id}`);
      } catch {
        console.error(`failed: image ${job.image_id}; retry is scheduled.`);
        process.exitCode = 1;
      }
    }
  } finally {
    await database.end();
  }
};

main().catch(() => {
  console.error("Image synchronization failed. Check configuration and database availability.");
  process.exitCode = 1;
});
