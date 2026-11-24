import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createError } from "h3";
import type { ListingPhotoUpload } from "./listing-image-upload.ts";
import { imageType } from "./image-signature.ts";
import { readBoundedFile } from "./bounded-file.ts";

const storageDirectory = () => resolve(process.env.LISTING_IMAGE_STORAGE_DIR || join(process.cwd(), ".data", "listing-images"));
const storagePath = (carId: string, imageId: string) => join(storageDirectory(), carId, imageId);
const storedImageUrl = (carId: string, imageId: string) => `/api/cars/${carId}/images/${imageId}`;
const isStoredImageUrl = (url: string, carId: string, imageId: string) => url === storedImageUrl(carId, imageId);

export const isListingImageUrl = isStoredImageUrl;

export const saveListingImage = async (carId: string, imageId: string, photo: ListingPhotoUpload) => {
  const directory = join(storageDirectory(), carId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(storagePath(carId, imageId), photo.data, { flag: "wx", mode: 0o600 });
};

export const removeListingImageFile = async (carId: string, imageId: string) => {
  try {
    await unlink(storagePath(carId, imageId));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
};

export const readListingImageFile = async (carId: string, imageId: string, imageUrl: string, maximumBytes?: number) => {
  if (!isStoredImageUrl(imageUrl, carId, imageId)) return null;
  let data: Buffer;
  try {
    data = maximumBytes ? await readBoundedFile(storagePath(carId, imageId), maximumBytes) : await readFile(storagePath(carId, imageId));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const mimeType = imageType(data);
  if (!mimeType) throw createError({ statusCode: 415, statusMessage: "Stored photo is not a supported image." });
  return { data, mimeType };
};

export const listingImageUrl = storedImageUrl;
