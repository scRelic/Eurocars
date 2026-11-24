import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadDemoVehicles, prepareDemoVehicles } from "../scripts/seed/vehicles.ts";

test("demo vehicles have stable identifiers, seller links, statuses and descriptions", async () => {
  const vehicles = await loadDemoVehicles();
  const users = JSON.parse(await readFile(new URL("../scripts/seed/data/users.json", import.meta.url), "utf8"));
  const dealers = JSON.parse(await readFile(new URL("../scripts/seed/data/dealers.json", import.meta.url), "utf8"));
  const usersByKey = new Map(users.map((user) => [user.key, user]));
  const dealersByKey = new Map(dealers.map((dealer) => [dealer.key, dealer]));

  assert.equal(vehicles.length, 50);
  assert.equal(new Set(vehicles.map((vehicle) => vehicle.description)).size, 50);
  assert.deepEqual(Object.fromEntries(["ACTIVE", "PENDING", "ARCHIVED", "SOLD"]
    .map((status) => [status, vehicles.filter((vehicle) => vehicle.status === status).length])),
  { ACTIVE: 40, PENDING: 5, ARCHIVED: 3, SOLD: 2 });
  for (const vehicle of vehicles) {
    assert.ok(usersByKey.has(vehicle.sellerKey));
    if (vehicle.dealerKey) assert.equal(dealersByKey.get(vehicle.dealerKey)?.owner, vehicle.sellerKey);
    assert.match(vehicle.description, /^Demo Listing:/);
  }
});

test("invalid or duplicate demo identifiers are rejected before use", async () => {
  const input = JSON.parse(await readFile(new URL("../scripts/seed/data/vehicles.json", import.meta.url), "utf8"));
  input[1].key = input[0].key;
  assert.throws(() => prepareDemoVehicles(input), /keys must be unique/);
  input[1].key = "different";
  input[1].engineCc = null;
  assert.throws(() => prepareDemoVehicles(input), /electric vehicles/i);
});
