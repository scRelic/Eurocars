import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { lockListingImages, queueListingImageDeletion } from "../../server/services/images/listing-image-state.service.ts";
import type { Counts, DemoDealer, DemoUser } from "./common.ts";

type RegistryRow = { seed_key: string; entity_id: string; metadata: { title?: string; description?: string; status?: string; sellerId?: string; passwordHashFingerprint?: string } };

export const showCleanupPlan = async (client: PoolClient, limit: number) => {
  const registry = await client.query<{ present: boolean }>(
    "SELECT to_regclass('eurocars_demo_seed_registry') IS NOT NULL AS present",
  );
  if (!registry.rows[0]?.present) {
    console.log("Cleanup dry-run: no demo registry found.");
    return;
  }
  const rows = await client.query<{ kind: string; count: string }>(
    "SELECT kind, COUNT(*)::text AS count FROM eurocars_demo_seed_registry GROUP BY kind ORDER BY kind",
  );
  console.log("Cleanup dry-run candidates (modified or referenced rows will be skipped):");
  for (const row of rows.rows) console.log(`  ${row.kind}: ${row.count}`);
  console.log(`At most ${limit} tracked cars will be considered in this run.`);
  console.log("Demo image Blob objects will be queued for the existing cleanup worker.");
};

const registered = async (client: PoolClient, kind: string) => {
  const result = await client.query<RegistryRow>(
    "SELECT seed_key,entity_id::text,metadata FROM eurocars_demo_seed_registry WHERE kind=$1 ORDER BY seed_key", [kind],
  );
  return result.rows;
};

export const cleanupDemo = async (client: PoolClient, users: DemoUser[], dealers: DemoDealer[], counts: Counts, limit: number) => {
  for (const row of (await registered(client, "car")).slice(0, limit)) {
    await lockListingImages(client, row.entity_id);
    const car = await client.query<{ id: string }>(
      `SELECT c.id::text FROM cars c WHERE c.id=$1 AND c.title=$2 AND c.description=$3 AND c.status=$4
       AND c.seller_id::text=$5 AND c.updated_at=c.created_at
       AND EXISTS (SELECT 1 FROM eurocars_demo_seed_registry r WHERE r.kind='user' AND r.entity_id=c.seller_id)
       FOR UPDATE`,
      [row.entity_id, row.metadata.title, row.metadata.description, row.metadata.status, row.metadata.sellerId],
    );
    if (!car.rowCount) { counts.skipped++; continue; }
    const dependencies = await client.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM favorites WHERE car_id=$1)
         OR EXISTS(SELECT 1 FROM conversations WHERE car_id=$1)
         OR EXISTS(SELECT 1 FROM notifications WHERE car_id=$1)
         OR EXISTS(SELECT 1 FROM listing_submission_keys WHERE car_id=$1)
         OR EXISTS(SELECT 1 FROM admin_audit_logs WHERE entity_id=$1)
         OR EXISTS(SELECT 1 FROM car_images i WHERE i.car_id=$1
           AND NOT EXISTS(SELECT 1 FROM eurocars_demo_seed_registry r WHERE r.kind='image' AND r.entity_id=i.id
             AND i.storage_provider='BLOB' AND i.upload_id::text=r.metadata->>'uploadId'))
       AS present`,
      [row.entity_id],
    );
    if (dependencies.rows[0]?.present) { counts.skipped++; continue; }
    const images = await client.query<{ id: string; upload_id: string | null; private_key: string | null; public_key: string | null }>(
      `SELECT id::text,upload_id::text,private_key::text,public_key::text FROM car_images WHERE car_id=$1 FOR UPDATE`,
      [row.entity_id],
    );
    for (const image of images.rows) await queueListingImageDeletion(client, row.entity_id, image);
    await client.query(
      "DELETE FROM eurocars_demo_seed_registry WHERE kind='image' AND entity_id IN (SELECT id FROM car_images WHERE car_id=$1)",
      [row.entity_id],
    );
    await client.query("DELETE FROM cars WHERE id=$1", [row.entity_id]);
    for (const image of images.rows) {
      if (image.upload_id) await client.query("DELETE FROM image_uploads WHERE id=$1 AND purpose='LISTING'", [image.upload_id]);
    }
    await client.query("DELETE FROM eurocars_demo_seed_registry WHERE kind='car' AND seed_key=$1", [row.seed_key]);
    counts.cars++;
    counts.images += images.rows.length;
  }

  for (const row of await registered(client, "dealer")) {
    const expected = dealers.find((item) => item.key === row.seed_key);
    if (!expected) { counts.skipped++; continue; }
    const dealer = await client.query(
      `SELECT id FROM dealers WHERE id=$1 AND name=$2 AND description=$3 AND country_code=$4 AND city=$5
       AND is_verified=FALSE AND updated_at=created_at
       AND EXISTS(SELECT 1 FROM eurocars_demo_seed_registry WHERE kind='user' AND seed_key=$6 AND entity_id=owner_id)
       FOR UPDATE`,
      [row.entity_id, expected.name, expected.description, expected.country, expected.city, expected.owner],
    );
    if (!dealer.rowCount || (await client.query("SELECT 1 FROM cars WHERE dealer_id=$1 LIMIT 1", [row.entity_id])).rowCount) {
      counts.skipped++;
      continue;
    }
    await client.query("DELETE FROM dealers WHERE id=$1", [row.entity_id]);
    await client.query("DELETE FROM eurocars_demo_seed_registry WHERE kind='dealer' AND seed_key=$1", [row.seed_key]);
    counts.dealers++;
  }

  for (const row of await registered(client, "user")) {
    const expected = users.find((item) => item.key === row.seed_key);
    if (!expected) { counts.skipped++; continue; }
    const user = await client.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1 AND LOWER(email)=LOWER($2) AND first_name=$3 AND last_name=$4
       AND country_code=$5 AND city=$6 AND role='USER' AND deleted_at IS NULL AND account_status='ACTIVE'
       AND updated_at=created_at FOR UPDATE`,
      [row.entity_id, expected.email, expected.firstName, expected.lastName, expected.country, expected.city],
    );
    if (!user.rows[0] || createHash("sha256").update(user.rows[0].password_hash).digest("hex") !== row.metadata.passwordHashFingerprint) {
      counts.skipped++;
      continue;
    }
    const references = await client.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM cars WHERE seller_id=$1 OR reviewed_by=$1 OR sale_reviewed_by=$1)
       OR EXISTS(SELECT 1 FROM dealers WHERE owner_id=$1)
       OR EXISTS(SELECT 1 FROM favorites WHERE user_id=$1)
       OR EXISTS(SELECT 1 FROM refresh_tokens WHERE user_id=$1)
       OR EXISTS(SELECT 1 FROM conversations WHERE buyer_id=$1 OR seller_id=$1)
       OR EXISTS(SELECT 1 FROM messages WHERE sender_id=$1)
       OR EXISTS(SELECT 1 FROM notifications WHERE user_id=$1)
       OR EXISTS(SELECT 1 FROM image_uploads WHERE user_id=$1)
       OR EXISTS(SELECT 1 FROM listing_submission_keys WHERE seller_id=$1)
       OR EXISTS(SELECT 1 FROM admin_audit_logs WHERE admin_id=$1)
       AS present`,
      [row.entity_id],
    );
    if (references.rows[0]?.present) { counts.skipped++; continue; }
    await client.query("DELETE FROM users WHERE id=$1", [row.entity_id]);
    await client.query("DELETE FROM eurocars_demo_seed_registry WHERE kind='user' AND seed_key=$1", [row.seed_key]);
    counts.users++;
  }
};
