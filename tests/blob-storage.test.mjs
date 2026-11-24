import assert from "node:assert/strict";
import test from "node:test";
import { VercelBlobStore } from "../server/services/storage/vercel-blob.service.ts";
import { readUploadedImage } from "../server/services/images/read-uploaded-image.service.ts";

test("storage rejects missing credentials and untrusted paths before contacting Blob", async () => {
  assert.throws(() => new VercelBlobStore("private", ""), /Missing/);
  const store = new VercelBlobStore("private", "test-token");
  for (const pathname of ["", "../other", "cars/../other", "cars//other", "https://example.test/a", "/cars/a"]) {
    await assert.rejects(store.getImage(pathname), /Invalid storage pathname/);
    await assert.rejects(store.uploadImage(pathname, Buffer.alloc(1), "image/webp"), /Invalid storage pathname/);
    await assert.rejects(store.deleteImages([pathname]), /Invalid storage pathname/);
  }
});

test("uploaded object is read only if metadata and bounded stream match the session", async () => {
  let cancelled = false;
  const store = (size, contentType, parts, pathname = "temp/1/example") => ({
    getImage: async () => ({
      statusCode: 200,
      blob: { pathname, size, contentType },
      stream: new ReadableStream({
        start(controller) {
          for (const part of parts) controller.enqueue(Buffer.from(part));
        },
        cancel() { cancelled = true; },
        pull(controller) { controller.close(); },
      }),
    }),
  });
  assert.deepEqual(await readUploadedImage(store(4, "image/png", ["ab", "cd"]), "temp/1/example", 4, "image/png"), Buffer.from("abcd"));
  await assert.rejects(readUploadedImage(store(4, "image/png", ["abcd"], "temp/1/other"), "temp/1/example", 4, "image/png"), /metadata/);
  assert.equal(cancelled, true);
  await assert.rejects(readUploadedImage(store(4, "image/webp", ["abcd"]), "temp/1/example", 4, "image/png"), /metadata/);
  await assert.rejects(readUploadedImage(store(4, "image/png", ["abcde"]), "temp/1/example", 4, "image/png"), /exceeds/);
  await assert.rejects(readUploadedImage(store(4, "image/png", ["abc"]), "temp/1/example", 4, "image/png"), /size/);
  await assert.rejects(readUploadedImage({ getImage: async () => null }, "temp/1/example", 4, "image/png"), /unavailable/);
});
