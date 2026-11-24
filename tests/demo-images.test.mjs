import assert from "node:assert/strict";
import test from "node:test";
import { missingImageCounts, validateImageSources } from "../scripts/seed/images.ts";

const source = {
  vehicleKey: "bmw-example",
  file: "bmw-example/front.jpg",
  sourceUrl: "https://example.com/photo",
  author: "Example author",
  license: "CC BY 4.0",
  licenseUrl: "https://example.com/license",
};

test("image manifest requires known vehicles and attribution", () => {
  const keys = new Set(["bmw-example", "audi-example"]);
  const sources = validateImageSources([source], keys);
  assert.deepEqual(missingImageCounts(keys, sources), [
    { key: "bmw-example", available: 1, missing: 2 },
    { key: "audi-example", available: 0, missing: 3 },
  ]);
  assert.throws(() => validateImageSources([{ ...source, author: "" }], keys));
  assert.throws(() => validateImageSources([{ ...source, vehicleKey: "unknown" }], keys));
  assert.throws(() => validateImageSources([{ ...source, file: "../outside.jpg" }], keys));
  assert.throws(() => validateImageSources([source, source], keys));
});
