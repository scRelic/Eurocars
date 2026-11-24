import type { PoolClient } from "pg";
import { register, registryId } from "./common.ts";
import type { Counts, DemoDealer } from "./common.ts";

export const seedDealers = async (client: PoolClient, dealers: DemoDealer[], counts: Counts) => {
  for (const dealer of dealers) {
    const owner = await registryId(client, "user", dealer.owner);
    if (!owner) throw new Error(`Demo dealer owner is missing: ${dealer.key}.`);
    const existing = await registryId(client, "dealer", dealer.key);
    if (existing) {
      const verified = await client.query(
        `SELECT id FROM dealers WHERE id=$1 AND owner_id=$2 AND name=$3 AND description=$4
         AND country_code=$5 AND city=$6 AND is_verified=FALSE AND updated_at=created_at`,
        [existing, owner, dealer.name, dealer.description, dealer.country, dealer.city],
      );
      if (!verified.rowCount) throw new Error(`Registered demo dealer changed: ${dealer.key}.`);
      counts.skipped++;
      continue;
    }
    if ((await client.query("SELECT id FROM dealers WHERE name=$1", [dealer.name])).rowCount) {
      throw new Error(`Demo dealership name already exists: ${dealer.key}.`);
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO dealers(owner_id,name,description,country_code,city,is_verified)
       VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id::text`,
      [owner, dealer.name, dealer.description, dealer.country, dealer.city],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Demo dealership insert returned no id.");
    await register(client, "dealer", dealer.key, id);
    counts.dealers++;
  }
};
