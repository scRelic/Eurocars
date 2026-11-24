import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { generateDisabledPasswordHash, register, registryId } from "./common.ts";
import type { Counts, DemoUser } from "./common.ts";

const countries: Record<string, string> = {
  DE: "Germany", FR: "France", PL: "Poland", IT: "Italy",
  NL: "Netherlands", BE: "Belgium", AT: "Austria",
};

export const seedUsers = async (client: PoolClient, users: DemoUser[], counts: Counts) => {
  for (const [code, name] of Object.entries(countries)) {
    await client.query("INSERT INTO countries(code,name,currency) VALUES ($1,$2,'EUR') ON CONFLICT (code) DO NOTHING", [code, name]);
  }
  for (const user of users) {
    const existing = await registryId(client, "user", user.key);
    if (existing) {
      const verified = await client.query<{ password_hash: string; fingerprint: string }>(
        `SELECT u.password_hash,r.metadata->>'passwordHashFingerprint' AS fingerprint FROM users u
         JOIN eurocars_demo_seed_registry r ON r.kind='user' AND r.entity_id=u.id
         WHERE u.id=$1 AND LOWER(u.email)=LOWER($2) AND u.role='USER' AND u.deleted_at IS NULL
           AND u.first_name=$3 AND u.last_name=$4 AND u.country_code=$5 AND u.city=$6
           AND u.account_status='ACTIVE' AND u.updated_at=u.created_at`,
        [existing, user.email, user.firstName, user.lastName, user.country, user.city],
      );
      const found = verified.rows[0];
      if (!found || createHash("sha256").update(found.password_hash).digest("hex") !== found.fingerprint) {
        throw new Error(`Registered demo user changed: ${user.key}.`);
      }
      counts.skipped++;
      continue;
    }
    const collision = await client.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [user.email]);
    if (collision.rowCount) throw new Error(`Reserved demo email is already in use: ${user.key}.`);
    const hash = await generateDisabledPasswordHash();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users(email,password_hash,first_name,last_name,role,country_code,city)
       VALUES ($1,$2,$3,$4,'USER',$5,$6) RETURNING id::text`,
      [user.email, hash, user.firstName, user.lastName, user.country, user.city],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Demo user insert returned no id.");
    await register(client, "user", user.key, id, { passwordHashFingerprint: createHash("sha256").update(hash).digest("hex") });
    counts.users++;
  }
};
