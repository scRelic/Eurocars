import { realpath, open } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Pool } from "pg";
import { readAvatarFile } from "../server/utils/avatar-storage.ts";
import { readListingImageFile } from "../server/utils/listing-image-storage.ts";
import { readBoundedFile } from "../server/utils/bounded-file.ts";
import { imageType } from "../server/utils/image-signature.ts";
import { getImageConfig } from "../server/services/images/image-config.ts";
import { ImageValidationError, processAvatarImage, processCarImage } from "../server/services/images/image-processing.service.ts";
import { stageLocalImage, attachMigratedListingImage } from "../server/services/images/migrate-local-image.service.ts";
import { applyAvatarUpload } from "../server/services/images/apply-avatar.service.ts";
import { syncListingImage } from "../server/services/images/sync-listing-image.service.ts";
import { VercelBlobStore } from "../server/services/storage/vercel-blob.service.ts";

type ListingRow = { id: string; car_id: string; user_id: string; image_url: string };
type AvatarRow = { id: string; avatar_url: string };
type Report = { kind: "listing" | "avatar"; id: string; status: string; sourceUrl?: string; uploadId?: string; sourceBytes?: number; optimizedBytes?: number; error?: string };

const errorMessage = (error: unknown) => {
  if (error instanceof ImageValidationError) return "Invalid or unsupported image.";
  if (error instanceof Error && [
    "Unsupported local image URL.", "Image path leaves the public directory.", "Unsupported local image format.",
    "Local image exceeds the size limit.", "Local image file is missing.", "Local avatar file is missing.",
    "Listing image changed during migration.", "The avatar changed during migration.",
  ].includes(error.message)) return error.message;
  return "Storage, file or database operation failed.";
};

const readPublicImage = async (url: string, maximumBytes: number) => {
  if (!/^\/images\/[a-zA-Z0-9._/-]+$/.test(url) || url.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Unsupported local image URL.");
  }
  const root = await realpath(resolve(process.cwd(), "public"));
  const path = await realpath(resolve(root, `.${url.replaceAll("/", sep)}`));
  const inside = relative(root, path);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("Image path leaves the public directory.");
  const data = await readBoundedFile(path, maximumBytes);
  const mimeType = imageType(data);
  if (!mimeType) throw new Error("Unsupported local image format.");
  return { data, mimeType };
};

const main = async () => {
  const args = process.argv.slice(2);
  const allowed = ["--kind=", "--batch-size=", "--after-id=", "--report="];
  if (args.some((arg) => arg !== "--apply" && !allowed.some((prefix) => arg.startsWith(prefix)))
    || allowed.some((prefix) => args.filter((arg) => arg.startsWith(prefix)).length > 1)) {
    throw new Error("Invalid migration arguments.");
  }
  const getArg = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const apply = args.includes("--apply");
  const kind = getArg("--kind=") ?? "all";
  const limit = Number(getArg("--batch-size=") ?? "20");
  const after = getArg("--after-id=") ?? "0";
  const reportPath = getArg("--report=");
  if (!["all", "listing", "avatar"].includes(kind) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || !/^(0|[1-9]\d{0,18})$/.test(after) || BigInt(after) > 9223372036854775807n
    || (kind === "all" && after !== "0") || (apply && !reportPath)) throw new Error("Invalid migration options.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error("DATABASE_URL is required.");
  const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  const publicToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (apply && (!privateToken?.trim() || !publicToken?.trim())) throw new Error("Both Blob tokens are required with --apply.");
  const report = reportPath ? await open(reportPath, "wx") : null;
  const database = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  let failures = 0;
  const record = async (entry: Report) => {
    const line = JSON.stringify(entry);
    console.log(line);
    if (report) {
      await report.write(`${line}\n`);
      await report.sync();
    }
    if (entry.status === "failed" || entry.status === "sync-pending") failures++;
  };
  try {
    const config = getImageConfig();
    const privateStore = apply ? new VercelBlobStore("private", privateToken!) : null;
    const publicStore = apply ? new VercelBlobStore("public", publicToken!) : null;
    let remaining = limit;
    if (kind !== "avatar") {
      const listings = await database.query<ListingRow>(
        `SELECT i.id::text, i.car_id::text, c.seller_id::text AS user_id, i.image_url
         FROM car_images i JOIN cars c ON c.id = i.car_id
         WHERE i.storage_provider = 'LOCAL' AND i.id > $1::bigint
           AND (i.image_url = '/api/cars/' || i.car_id || '/images/' || i.id OR i.image_url LIKE '/images/%')
         ORDER BY i.id LIMIT $2`,
        [after, remaining],
      );
      remaining -= listings.rows.length;
      for (const row of listings.rows) {
        try {
          const local = row.image_url.startsWith("/images/")
            ? await readPublicImage(row.image_url, config.maxFileMb * 1024 * 1024)
            : await readListingImageFile(row.car_id, row.id, row.image_url, config.maxFileMb * 1024 * 1024);
          if (!local) throw new Error("Local image file is missing.");
          if (!privateStore || !publicStore) {
            const variants = await processCarImage(local.data, local.mimeType);
            await record({ kind: "listing", id: row.id, status: "would-migrate", sourceBytes: local.data.length,
              optimizedBytes: variants.thumbnail.data.length + variants.catalog.data.length + variants.gallery.data.length });
            continue;
          }
          const uploadId = await stageLocalImage(database, privateStore, row.user_id, "LISTING", local.data, local.mimeType);
          const size = await database.query<{ size: string }>("SELECT SUM(file_size)::text AS size FROM image_upload_variants WHERE upload_id=$1", [uploadId]);
          await record({ kind: "listing", id: row.id, status: "staged", sourceUrl: row.image_url, uploadId });
          await attachMigratedListingImage(database, row.car_id, row.id, row.user_id, row.image_url, uploadId);
          let pending = false;
          try {
            await syncListingImage(database, privateStore, publicStore, row.id);
            pending = !!(await database.query("SELECT 1 FROM image_sync_jobs WHERE image_id=$1", [row.id])).rowCount;
          } catch {
            pending = true;
          }
          await record({ kind: "listing", id: row.id, status: pending ? "sync-pending" : "migrated", sourceUrl: row.image_url, uploadId,
            sourceBytes: local.data.length, optimizedBytes: Number(size.rows[0]?.size) });
        } catch (error) {
          await record({ kind: "listing", id: row.id, status: "failed", error: errorMessage(error) });
        }
      }
    }
    if (kind !== "listing" && remaining) {
      const avatars = await database.query<AvatarRow>(
        `SELECT id::text, avatar_url FROM users WHERE id > $1::bigint AND deleted_at IS NULL
         AND avatar_url LIKE '/api/users/' || id || '/avatar/%' ORDER BY id LIMIT $2`,
        [after, remaining],
      );
      for (const row of avatars.rows) {
        try {
          const token = row.avatar_url.slice(`/api/users/${row.id}/avatar/`.length);
          const local = await readAvatarFile(row.id, token, 5 * 1024 * 1024);
          if (!local) throw new Error("Local avatar file is missing.");
          if (!privateStore || !publicStore) {
            const variant = await processAvatarImage(local.data, local.mimeType);
            await record({ kind: "avatar", id: row.id, status: "would-migrate", sourceBytes: local.data.length, optimizedBytes: variant.data.length });
            continue;
          }
          const uploadId = await stageLocalImage(database, privateStore, row.id, "AVATAR", local.data, local.mimeType);
          const size = await database.query<{ size: string }>("SELECT file_size::text AS size FROM image_upload_variants WHERE upload_id=$1 AND variant='avatar'", [uploadId]);
          await record({ kind: "avatar", id: row.id, status: "staged", sourceUrl: row.avatar_url, uploadId });
          await applyAvatarUpload(database, privateStore, publicStore, row.id, uploadId, row.avatar_url);
          await record({ kind: "avatar", id: row.id, status: "migrated", sourceUrl: row.avatar_url, uploadId, sourceBytes: local.data.length, optimizedBytes: Number(size.rows[0]?.size) });
        } catch (error) {
          await record({ kind: "avatar", id: row.id, status: "failed", error: errorMessage(error) });
        }
      }
    }
  } finally {
    await database.end();
    if (report) await report.close();
  }
  if (failures) process.exitCode = 1;
};

main().catch(() => {
  console.error("Image migration failed. Check configuration and database availability. Usage: node scripts/migrate-images.ts [--kind=all|listing|avatar] [--batch-size=20] [--after-id=0] [--report=path] [--apply].");
  process.exitCode = 1;
});
