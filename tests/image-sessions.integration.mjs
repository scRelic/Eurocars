import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import sharp from "sharp";
import { prepareUploadSession, UploadSessionError } from "../server/services/images/upload-sessions.service.ts";
import { issueClientUploadToken } from "../server/services/images/client-upload-token.service.ts";
import { completeUploadSession } from "../server/services/images/complete-upload.service.ts";
import { cleanupTemporaryImages } from "../server/services/images/image-cleanup.service.ts";
import { applyAvatarUpload } from "../server/services/images/apply-avatar.service.ts";
import { syncListingImage } from "../server/services/images/sync-listing-image.service.ts";
import { updateListingImageVisibility } from "../server/services/images/listing-image-state.service.ts";
import { cleanupListingImages } from "../server/services/images/listing-image-cleanup.service.ts";
import { stageLocalImage, attachMigratedListingImage } from "../server/services/images/migrate-local-image.service.ts";

const connectionString = process.env.IMAGE_TEST_DATABASE_URL;
if (!connectionString || !["127.0.0.1", "localhost", "::1"].includes(new URL(connectionString).hostname)
  || !new URL(connectionString).pathname.endsWith("/eurocars_image_migration_test")) {
  throw new Error("IMAGE_TEST_DATABASE_URL must point to the disposable local image migration database.");
}
const database = new Pool({ connectionString, max: 25 });

test("upload sessions enforce validation and a transactional per-user quota", async () => {
  try {
    await database.query("INSERT INTO users (id) VALUES (1), (2), (3), (4)");
    await assert.rejects(prepareUploadSession(database, "1", "AVATAR", 5 * 1024 * 1024 + 1, "image/png"), UploadSessionError);
    await assert.rejects(prepareUploadSession(database, "1", "LISTING", 0, "image/png"), UploadSessionError);
    await assert.rejects(prepareUploadSession(database, "1", "LISTING", 100, "image/svg+xml"), UploadSessionError);
    await assert.rejects(prepareUploadSession(database, "9223372036854775808", "LISTING", 100, "image/png"), UploadSessionError);
    const attempts = await Promise.allSettled(Array.from({ length: 25 }, () =>
      prepareUploadSession(database, "1", "LISTING", 1024, "image/png")));
    const succeeded = attempts.filter((result) => result.status === "fulfilled");
    const failed = attempts.filter((result) => result.status === "rejected");
    assert.equal(succeeded.length, 20);
    assert.equal(failed.length, 5);
    for (const result of failed) assert.ok(result.reason instanceof UploadSessionError);
    const rows = await database.query("SELECT id, temporary_blob_pathname, status FROM image_uploads WHERE user_id=1");
    assert.equal(rows.rowCount, 20);
    assert.equal(new Set(rows.rows.map((row) => row.temporary_blob_pathname)).size, 20);
    for (const row of rows.rows) {
      assert.equal(row.status, "PENDING");
      assert.equal(row.temporary_blob_pathname, `temp/1/${row.id}`);
    }
    const other = await prepareUploadSession(database, "2", "AVATAR", 1024, "image/webp");
    assert.match(other.pathname, /^temp\/2\/[0-9a-f-]+$/);
    const request = new Request("https://localhost/api/uploads/blob", { method: "POST" });
    const fakeToken = "vercel_blob_rw_test_fake";
    await assert.rejects(issueClientUploadToken(database, "1", other.id, other.pathname, fakeToken, request));
    await assert.rejects(issueClientUploadToken(database, "1", other.id, `temp/1/${other.id}`, fakeToken, request));
    await assert.rejects(issueClientUploadToken(database, "2", other.id, `temp/2/${other.id}-other`, fakeToken, request));
    const clientToken = await issueClientUploadToken(database, "2", other.id, other.pathname, fakeToken, request);
    const constraints = getPayloadFromClientToken(clientToken);
    assert.equal(constraints.pathname, other.pathname);
    assert.deepEqual(constraints.allowedContentTypes, ["image/webp"]);
    assert.equal(constraints.maximumSizeInBytes, 1024);
    assert.equal(constraints.allowOverwrite, false);
    assert.equal(constraints.addRandomSuffix, false);
    assert.ok(constraints.validUntil <= other.expiresAt.getTime());
    assert.ok(constraints.validUntil <= Date.now() + 5 * 60 * 1000);
    await issueClientUploadToken(database, "2", other.id, other.pathname, fakeToken, request);
    await database.query("UPDATE image_uploads SET status='CANCELLED' WHERE id=$1", [other.id]);
    await assert.rejects(issueClientUploadToken(database, "2", other.id, other.pathname, fakeToken, request));
    await database.query("UPDATE image_uploads SET status='UPLOADING', created_at=NOW()-INTERVAL '20 minutes', expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [other.id]);
    await assert.rejects(issueClientUploadToken(database, "2", other.id, other.pathname, fakeToken, request));
    await database.query("UPDATE image_uploads SET status='READY', completed_at=NOW(), consumed_at=NOW(), expires_at=NOW()+INTERVAL '15 minutes' WHERE id=$1", [other.id]);
    await assert.rejects(issueClientUploadToken(database, "2", other.id, other.pathname, fakeToken, request));
    await database.query(`INSERT INTO image_uploads
      (id,user_id,purpose,temporary_blob_pathname,status,expected_file_size,expected_mime_type,expires_at)
      SELECT md5('rate-test-' || n)::uuid, 2, 'AVATAR', 'temp/2/' || md5('rate-test-' || n),
        'CANCELLED', 100, 'image/png', NOW() + INTERVAL '15 minutes'
      FROM generate_series(1,59) AS n`);
    await assert.rejects(prepareUploadSession(database, "2", "AVATAR", 1024, "image/webp"), /Upload limit reached/);

    const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#123" } }).png().toBuffer();
    const objects = new Map();
    let reads = 0;
    let failNextWrite = false;
    const store = {
      async getImage(pathname) {
        reads++;
        const object = objects.get(pathname);
        if (!object) return null;
        return {
          statusCode: 200,
          blob: { pathname, size: object.data.length, contentType: object.type },
          stream: new ReadableStream({ start(controller) { controller.enqueue(object.data); controller.close(); } }),
        };
      },
      async uploadImage(pathname, data, contentType) {
        if (failNextWrite) { failNextWrite = false; throw new Error("storage unavailable"); }
        assert.equal(objects.has(pathname), false);
        objects.set(pathname, { data, type: contentType });
        return { pathname };
      },
      async getImageMetadata(pathname) {
        const object = objects.get(pathname);
        return { pathname, size: object.data.length, contentType: object.type };
      },
    };
    const uploaded = await prepareUploadSession(database, "3", "LISTING", png.length, "image/png");
    objects.set(uploaded.pathname, { data: png, type: "image/png" });
    await issueClientUploadToken(database, "3", uploaded.id, uploaded.pathname, fakeToken, request);
    await assert.rejects(completeUploadSession(database, store, "4", uploaded.id), UploadSessionError);
    failNextWrite = true;
    await assert.rejects(completeUploadSession(database, store, "3", uploaded.id), /storage unavailable/);
    assert.equal((await database.query("SELECT status FROM image_uploads WHERE id=$1", [uploaded.id])).rows[0].status, "UPLOADING");
    let unblockRead;
    let notifyStarted;
    const blocked = new Promise((resolve) => { unblockRead = resolve; });
    const started = new Promise((resolve) => { notifyStarted = resolve; });
    const slowStore = {
      ...store,
      async getImage(pathname) {
        notifyStarted();
        await blocked;
        return store.getImage(pathname);
      },
    };
    const processing = completeUploadSession(database, slowStore, "3", uploaded.id);
    await started;
    await assert.rejects(completeUploadSession(database, store, "3", uploaded.id), /not ready/);
    unblockRead();
    const variants = await processing;
    assert.deepEqual(variants.map((variant) => variant.variant), ["catalog", "gallery", "thumbnail"]);
    assert.equal(variants[0].width, 80);
    assert.equal(variants[0].mime_type, "image/webp");
    const readsBeforeRepeat = reads;
    assert.deepEqual(await completeUploadSession(database, store, "3", uploaded.id), variants);
    assert.equal(reads, readsBeforeRepeat);
    const jobs = await database.query("SELECT pathname FROM image_delete_jobs WHERE pathname LIKE $1", [`temp/3/${uploaded.id}%`]);
    assert.equal(jobs.rowCount, 7);

    const spoof = await prepareUploadSession(database, "3", "AVATAR", png.length, "image/jpeg");
    objects.set(spoof.pathname, { data: png, type: "image/jpeg" });
    await issueClientUploadToken(database, "3", spoof.id, spoof.pathname, fakeToken, request);
    await assert.rejects(completeUploadSession(database, store, "3", spoof.id), /does not match/);
    const invalidImage = await database.query("SELECT status, error_code FROM image_uploads WHERE id=$1", [spoof.id]);
    assert.deepEqual(invalidImage.rows[0], { status: "FAILED", error_code: "INVALID_IMAGE" });
    const missing = await prepareUploadSession(database, "3", "AVATAR", png.length, "image/png");
    await issueClientUploadToken(database, "3", missing.id, missing.pathname, fakeToken, request);
    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(completeUploadSession(database, store, "3", missing.id), /unavailable/);
    }
    const readsAtLimit = reads;
    await assert.rejects(completeUploadSession(database, store, "3", missing.id), /retry limit/);
    assert.equal(reads, readsAtLimit);
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE pathname LIKE $1", [`temp/3/${uploaded.id}%`]);
    const deleted = [];
    let deleteFailure = true;
    const deleteStore = {
      async deleteImages(paths) {
        if (deleteFailure) { deleteFailure = false; throw new Error("storage unavailable"); }
        deleted.push(...paths);
        for (const path of paths) objects.delete(path);
      },
    };
    const preview = await cleanupTemporaryImages(database, deleteStore, { limit: 50, dryRun: true });
    assert.equal(preview.length, 7);
    assert.equal(preview.filter((entry) => entry.outcome === "protected").length, 3);
    assert.equal(deleted.length, 0);
    const cleanup = await cleanupTemporaryImages(database, deleteStore, { limit: 50, dryRun: false });
    assert.equal(cleanup.filter((entry) => entry.outcome === "failed").length, 1);
    assert.equal(cleanup.filter((entry) => entry.outcome === "protected").length, 3);
    for (const variant of variants) assert.equal(objects.has(variant.pathname), true);
    const failedJob = cleanup.find((entry) => entry.outcome === "failed");
    const retryRow = await database.query("SELECT attempts FROM image_delete_jobs WHERE pathname=$1", [failedJob.pathname]);
    assert.equal(retryRow.rows[0].attempts, 1);
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE pathname=$1", [failedJob.pathname]);
    const retry = await cleanupTemporaryImages(database, deleteStore, { limit: 50, dryRun: false });
    assert.ok(retry.some((entry) => entry.pathname === failedJob.pathname && entry.outcome === "deleted"));

    const publicObjects = new Map();
    let publishFailure = true;
    const publicStore = {
      ownsPublicUrl(url, path) { return url === `https://test.public.blob.vercel-storage.com/${path}`; },
      async uploadImage(path, data, type) {
        if (publishFailure) { publishFailure = false; throw new Error("storage unavailable"); }
        publicObjects.set(path, { data, type });
        return { pathname: path, url: `https://test.public.blob.vercel-storage.com/${path}` };
      },
      async getImageMetadata(path) {
        const object = publicObjects.get(path);
        return { pathname: path, size: object.data.length, contentType: object.type };
      },
      async deleteImages(paths) {
        for (const path of paths) publicObjects.delete(path);
      },
    };
    const prepareAvatar = async () => {
      const session = await prepareUploadSession(database, "3", "AVATAR", png.length, "image/png");
      objects.set(session.pathname, { data: png, type: "image/png" });
      await issueClientUploadToken(database, "3", session.id, session.pathname, fakeToken, request);
      await completeUploadSession(database, store, "3", session.id);
      return session;
    };
    await database.query("UPDATE users SET avatar_url='https://example.test/old.png' WHERE id=3");
    const avatar = await prepareAvatar();
    await assert.rejects(applyAvatarUpload(database, store, publicStore, "4", avatar.id), UploadSessionError);
    await assert.rejects(applyAvatarUpload(database, store, publicStore, "3", avatar.id), /storage unavailable/);
    assert.equal((await database.query("SELECT avatar_url FROM users WHERE id=3")).rows[0].avatar_url, "https://example.test/old.png");
    const account = await applyAvatarUpload(database, store, publicStore, "3", avatar.id);
    assert.match(account.avatarUrl, /^https:\/\/test\.public\.blob\.vercel-storage\.com\/avatars\/3\/.+\.webp$/);
    assert.equal((await applyAvatarUpload(database, store, publicStore, "3", avatar.id)).avatarUrl, account.avatarUrl);
    const replacement = await prepareAvatar();
    const replaced = await applyAvatarUpload(database, store, publicStore, "3", replacement.id);
    assert.notEqual(replaced.avatarUrl, account.avatarUrl);
    await assert.rejects(applyAvatarUpload(database, store, publicStore, "3", avatar.id), /already been used/);
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE store='PUBLIC'");
    const publicPreview = await cleanupTemporaryImages(database, deleteStore, { limit: 50, dryRun: true, publicStore });
    const activePath = new URL(replaced.avatarUrl).pathname.slice(1);
    const oldPath = new URL(account.avatarUrl).pathname.slice(1);
    assert.ok(publicPreview.some((entry) => entry.pathname === activePath && entry.outcome === "protected"));
    assert.ok(publicPreview.some((entry) => entry.pathname === oldPath && entry.outcome === "would-delete"));
    await cleanupTemporaryImages(database, deleteStore, { limit: 50, dryRun: false, publicStore });
    assert.equal(publicObjects.has(activePath), true);
    assert.equal(publicObjects.has(oldPath), false);

    process.env.BLOB_LISTING_ENABLED = "true";
    await database.query("UPDATE image_uploads SET consumed_at=NOW() WHERE id=$1", [uploaded.id]);
    await database.query("INSERT INTO cars (id,status) VALUES (10,'PENDING')");
    await database.query(`INSERT INTO car_images (id,car_id,image_url,storage_provider,upload_id)
      VALUES (100,10,'/api/cars/10/images/100','BLOB',$1)`, [uploaded.id]);
    await database.query("INSERT INTO image_sync_jobs (image_id) VALUES (100)");
    const publicCountBefore = publicObjects.size;
    await syncListingImage(database, store, publicStore, "100");
    const privateListing = (await database.query("SELECT private_key, public_key, image_url FROM car_images WHERE id=100")).rows[0];
    assert.ok(privateListing.private_key);
    assert.equal(privateListing.public_key, null);
    assert.equal(publicObjects.size, publicCountBefore, "pending photos are not published");
    assert.equal((await database.query("SELECT COUNT(*)::int AS n FROM image_upload_variants WHERE upload_id=$1", [uploaded.id])).rows[0].n, 0);
    await database.query("UPDATE cars SET status='ACTIVE' WHERE id=10");
    await database.query("INSERT INTO image_sync_jobs (image_id) VALUES (100)");
    await syncListingImage(database, store, publicStore, "100");
    const publicListing = (await database.query("SELECT private_key, public_key, image_url FROM car_images WHERE id=100")).rows[0];
    assert.ok(publicListing.public_key);
    assert.match(publicListing.image_url, /^https:\/\/test\.public\.blob\.vercel-storage\.com\/cars\/10\//);
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE cars SET status='ARCHIVED' WHERE id=10");
      await updateListingImageVisibility(client, "10", "ARCHIVED");
      await client.query("COMMIT");
    } finally { client.release(); }
    const archived = (await database.query("SELECT public_key, private_key, image_url FROM car_images WHERE id=100")).rows[0];
    assert.equal(archived.public_key, null);
    assert.equal(archived.private_key, privateListing.private_key);
    assert.equal(archived.image_url, "/api/cars/10/images/100");
    const deletion = await database.query("SELECT COUNT(*)::int AS n FROM image_delete_jobs WHERE store='PUBLIC' AND pathname LIKE $1", [`cars/10/${publicListing.public_key}/%`]);
    assert.equal(deletion.rows[0].n, 3);
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE pathname LIKE 'cars/10/%'");
    await database.query("UPDATE users SET avatar_url=$1 WHERE id=4", [publicListing.image_url]);
    const listingCleanup = await cleanupListingImages(database, { privateStore: deleteStore, publicStore }, { limit: 50, dryRun: false });
    assert.equal(listingCleanup.filter((entry) => entry.store === "PRIVATE" && entry.outcome === "protected").length, 3);
    assert.equal(listingCleanup.filter((entry) => entry.store === "PUBLIC" && entry.outcome === "deleted").length, 2);
    assert.ok(publicObjects.has(new URL(publicListing.image_url).pathname.slice(1)), "another user's avatar reference is protected");
    await database.query("UPDATE users SET avatar_url=NULL WHERE id=4");
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE store='PUBLIC' AND pathname LIKE 'cars/10/%'");
    await cleanupListingImages(database, { privateStore: deleteStore, publicStore }, { limit: 50, dryRun: false });
    assert.equal(publicObjects.has(new URL(publicListing.image_url).pathname.slice(1)), false);

    await database.query("ALTER TABLE cars ADD COLUMN seller_id BIGINT");
    await database.query("INSERT INTO cars (id, status, seller_id) VALUES (11, 'PENDING', 3)");
    await database.query("INSERT INTO car_images (id, car_id, image_url) VALUES (101, 11, '/images/old.png')");
    const staged = await stageLocalImage(database, store, "3", "LISTING", png, "image/png");
    await assert.rejects(attachMigratedListingImage(database, "11", "101", "3", "/images/changed.png", staged), /changed/);
    assert.equal((await database.query("SELECT consumed_at FROM image_uploads WHERE id=$1", [staged])).rows[0].consumed_at, null);
    await attachMigratedListingImage(database, "11", "101", "3", "/images/old.png", staged);
    assert.deepEqual((await database.query("SELECT storage_provider, image_url FROM car_images WHERE id=101")).rows[0],
      { storage_provider: "BLOB", image_url: "/api/cars/11/images/101" });
    await syncListingImage(database, store, publicStore, "101");
    assert.ok((await database.query("SELECT private_key FROM car_images WHERE id=101")).rows[0].private_key);
    await assert.rejects(attachMigratedListingImage(database, "11", "101", "3", "/images/old.png", staged), /changed/);

    const stagedAvatar = await stageLocalImage(database, store, "3", "AVATAR", png, "image/png");
    await assert.rejects(applyAvatarUpload(database, store, publicStore, "3", stagedAvatar, "stale"), /changed during migration/);
    assert.equal((await database.query("SELECT avatar_url FROM users WHERE id=3")).rows[0].avatar_url, replaced.avatarUrl);
    const migratedAvatar = await applyAvatarUpload(database, store, publicStore, "3", stagedAvatar, replaced.avatarUrl);
    assert.notEqual(migratedAvatar.avatarUrl, replaced.avatarUrl);
    const migratedAvatarPath = new URL(migratedAvatar.avatarUrl).pathname.slice(1);
    await database.query("INSERT INTO car_images (id, car_id, image_url) VALUES (102, 11, $1)", [migratedAvatar.avatarUrl]);
    await database.query("UPDATE users SET avatar_url=NULL WHERE id=3");
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE pathname=$1", [migratedAvatarPath]);
    const avatarReferences = await cleanupTemporaryImages(database, deleteStore, { limit: 100, dryRun: false, publicStore });
    assert.ok(avatarReferences.some((entry) => entry.pathname === migratedAvatarPath && entry.outcome === "protected"));
    assert.ok(publicObjects.has(migratedAvatarPath));
    await database.query("DELETE FROM car_images WHERE id=102");

    const localDirectory = await mkdtemp(join(tmpdir(), "eurocars-image-cli-"));
    try {
      await mkdir(join(localDirectory, "11"));
      await writeFile(join(localDirectory, "11", "102"), png);
      await database.query("INSERT INTO car_images (id, car_id, image_url) VALUES (102, 11, '/api/cars/11/images/102')");
      const before = (await database.query("SELECT COUNT(*)::int AS n FROM image_uploads")).rows[0].n;
      const dryRun = spawnSync(process.execPath, [join("scripts", "migrate-images.ts"), "--kind=listing", "--after-id=101"],
        { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: connectionString, LISTING_IMAGE_STORAGE_DIR: localDirectory }, encoding: "utf8" });
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.equal(JSON.parse(dryRun.stdout.trim()).status, "would-migrate");
      assert.equal((await database.query("SELECT COUNT(*)::int AS n FROM image_uploads")).rows[0].n, before);
      assert.equal((await database.query("SELECT storage_provider FROM car_images WHERE id=102")).rows[0].storage_provider, "LOCAL");
    } finally {
      await rm(localDirectory, { recursive: true, force: true });
    }

    const stale = await prepareUploadSession(database, "4", "LISTING", png.length, "image/png");
    const active = await prepareUploadSession(database, "4", "LISTING", png.length, "image/png");
    await database.query(`UPDATE image_uploads SET status='PROCESSING', created_at=NOW()-INTERVAL '2 hours',
      expires_at=NOW()-INTERVAL '1 hour', processing_started_at=NOW()-INTERVAL '70 minutes' WHERE id=$1`, [stale.id]);
    await database.query("UPDATE image_uploads SET status='PROCESSING', processing_started_at=NOW() WHERE id=$1", [active.id]);
    await database.query("UPDATE image_delete_jobs SET next_attempt_at=NOW() WHERE pathname IN ($1, $2)", [stale.pathname, active.pathname]);
    const stalePreview = await cleanupTemporaryImages(database, deleteStore, { limit: 100, dryRun: true });
    assert.ok(stalePreview.some((entry) => entry.pathname === stale.pathname && entry.outcome === "would-delete"));
    assert.ok(stalePreview.some((entry) => entry.pathname === active.pathname && entry.outcome === "protected"));
    assert.equal((await database.query("SELECT status FROM image_uploads WHERE id=$1", [stale.id])).rows[0].status, "PROCESSING");
    await cleanupTemporaryImages(database, deleteStore, { limit: 100, dryRun: false });
    assert.equal((await database.query("SELECT status FROM image_uploads WHERE id=$1", [stale.id])).rows[0].status, "EXPIRED");
    assert.equal((await database.query("SELECT status FROM image_uploads WHERE id=$1", [active.id])).rows[0].status, "PROCESSING");
  } finally {
    await database.end();
  }
});
