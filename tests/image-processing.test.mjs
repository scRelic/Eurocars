import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { ImageProcessingBusyError, ImageValidationError, processAvatarImage, processCarImage } from "../server/services/images/image-processing.service.ts";

test("car images are resized to WebP without metadata and without enlargement", async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#8491a4" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const variants = await processCarImage(input);
  for (const [name, maximum] of [["thumbnail", 320], ["catalog", 640], ["gallery", 1920]]) {
    const image = variants[name];
    const metadata = await sharp(image.data).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(Math.max(image.width, image.height) <= maximum);
    assert.ok(image.height > image.width, "EXIF orientation is applied");
    assert.equal(metadata.exif, undefined);
  }
  const tiny = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#fff" } }).png().toBuffer();
  const small = await processCarImage(tiny);
  assert.equal(small.gallery.width, 40);
  assert.equal(small.gallery.height, 20);
});

test("avatars are square WebP with the requested maximum size", async () => {
  const input = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#123" } }).png().toBuffer();
  const avatar = await processAvatarImage(input);
  assert.equal(avatar.width, 256);
  assert.equal(avatar.height, 256);
  assert.equal((await sharp(avatar.data).metadata()).format, "webp");
  const small = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#123" } }).png().toBuffer();
  const smallAvatar = await processAvatarImage(small);
  assert.equal(smallAvatar.width, 20);
  assert.equal(smallAvatar.height, 20);
});

test("invalid, oversized, unsupported and animated images are rejected", async () => {
  await assert.rejects(processCarImage(Buffer.from("<svg></svg>")), ImageValidationError);
  await assert.rejects(processCarImage(Buffer.alloc(10 * 1024 * 1024 + 1)), ImageValidationError);
  await assert.rejects(processAvatarImage(Buffer.alloc(5 * 1024 * 1024 + 1)), ImageValidationError);
  const valid = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
  await assert.rejects(processCarImage(valid, "image/jpeg"), /does not match/);
  await assert.rejects(processAvatarImage(valid, "image/webp"), /does not match/);
  await assert.rejects(processCarImage(valid.subarray(0, 45)), ImageValidationError);
  const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).gif().toBuffer();
  await assert.rejects(processCarImage(gif), ImageValidationError);
  const frames = Buffer.concat([Buffer.alloc(10 * 10 * 3, 40), Buffer.alloc(10 * 10 * 3, 200)]);
  const animated = await sharp(frames, { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } })
    .webp({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(processCarImage(animated), ImageValidationError);
});

test("images above the pixel limit are rejected", async () => {
  const image = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "#fff" } })
    .png().toBuffer();
  await assert.rejects(processCarImage(image), ImageValidationError);
});

test("processing concurrency is bounded and slots are released", async () => {
  const image = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#fff" } }).png().toBuffer();
  const results = await Promise.allSettled([processCarImage(image), processAvatarImage(image), processCarImage(image)]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(results[2].status, "rejected");
  assert.ok(results[2].reason instanceof ImageProcessingBusyError);
  assert.equal((await processAvatarImage(image)).width, 128);
});

test("configured size limits and output widths are applied and invalid configuration fails", async () => {
  const settings = {
    IMAGE_MAX_FILE_SIZE_MB: "1",
    IMAGE_MAX_WIDTH: "500",
    IMAGE_CATALOG_WIDTH: "300",
    IMAGE_THUMBNAIL_WIDTH: "100",
    IMAGE_AVATAR_SIZE: "64",
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, settings);
    const image = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#123" } }).png().toBuffer();
    const processed = await processCarImage(image);
    assert.equal(processed.thumbnail.width, 100);
    assert.equal(processed.catalog.width, 300);
    assert.equal(processed.gallery.width, 500);
    assert.equal((await processAvatarImage(image)).width, 64);
    await assert.rejects(processCarImage(Buffer.alloc(1024 * 1024 + 1)), /size/);
    process.env.IMAGE_MAX_WIDTH = "invalid";
    await assert.rejects(processCarImage(image), /IMAGE_MAX_WIDTH/);
    process.env.IMAGE_MAX_WIDTH = "200";
    await assert.rejects(processCarImage(image), /widths/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
