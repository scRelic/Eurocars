import sharp from "sharp";
import type { Metadata } from "sharp";
import { getImageConfig } from "./image-config.ts";

const maxInputPixels = 40_000_000;
const allowedFormats = new Set(["jpeg", "png", "webp"]);
const maxConcurrentImages = 2;
let activeImages = 0;

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export class ImageProcessingBusyError extends Error {
  constructor() {
    super("Image processing is busy. Please try again.");
    this.name = "ImageProcessingBusyError";
  }
}

const withProcessingSlot = async <T>(process: () => Promise<T>): Promise<T> => {
  if (activeImages >= maxConcurrentImages) throw new ImageProcessingBusyError();
  activeImages++;
  try {
    return await process();
  } finally {
    activeImages--;
  }
};

export type ImageVariant = {
  data: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
};

type ExpectedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

const checkImage = async (input: Buffer, maxBytes: number, expectedMimeType?: ExpectedImageMimeType) => {
  if (!input.length || input.length > maxBytes) {
    throw new ImageValidationError("Image size exceeds the allowed limit or is empty.");
  }
  const image = sharp(input, { limitInputPixels: maxInputPixels, failOn: "warning", sequentialRead: true });
  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch (error) {
    throw new ImageValidationError(`Unable to decode image: ${error instanceof Error ? error.message : "invalid input"}`);
  }
  if (!metadata.format || !allowedFormats.has(metadata.format) || !metadata.width || !metadata.height) {
    throw new ImageValidationError("Only JPEG, PNG and WebP images are supported.");
  }
  if (expectedMimeType && `image/${metadata.format}` !== expectedMimeType) {
    throw new ImageValidationError("Image content does not match its declared type.");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new ImageValidationError("Animated images are not supported.");
  }
  if (metadata.width * metadata.height > maxInputPixels) {
    throw new ImageValidationError("Image dimensions exceed the allowed limit.");
  }
  return { width: metadata.width, height: metadata.height };
};

const convert = async (input: Buffer, size: number, quality: number, fit: "inside" | "cover"): Promise<ImageVariant> => {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: maxInputPixels, failOn: "warning", sequentialRead: true })
      .rotate()
      .resize({ width: size, height: size, fit, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, mimeType: "image/webp" };
  } catch (error) {
    throw new ImageValidationError(`Unable to process image: ${error instanceof Error ? error.message : "invalid input"}`);
  }
};

export const processCarImage = (input: Buffer, expectedMimeType?: ExpectedImageMimeType) => withProcessingSlot(async () => {
  const config = getImageConfig();
  await checkImage(input, config.maxFileMb * 1024 * 1024, expectedMimeType);
  const thumbnail = await convert(input, config.thumbnailWidth, 75, "inside");
  const catalog = await convert(input, config.catalogWidth, 80, "inside");
  const gallery = await convert(input, config.maxWidth, config.webpQuality, "inside");
  return { thumbnail, catalog, gallery };
});

export const processCarGalleryImage = (input: Buffer) => withProcessingSlot(async () => {
  const config = getImageConfig();
  await checkImage(input, config.maxFileMb * 1024 * 1024);
  return convert(input, config.maxWidth, config.webpQuality, "inside");
});

export const processAvatarImage = (input: Buffer, expectedMimeType?: ExpectedImageMimeType) => withProcessingSlot(async () => {
  const metadata = await checkImage(input, 5 * 1024 * 1024, expectedMimeType);
  return convert(input, Math.min(getImageConfig().avatarSize, metadata.width, metadata.height), 85, "cover");
});
