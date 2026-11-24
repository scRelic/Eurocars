import { readBody, readMultipartFormData } from "h3";
import type { H3Event } from "h3";
import { z } from "zod";
import { idSchema } from "../validators/listing";
import { ImageProcessingBusyError, ImageValidationError, processCarGalleryImage } from "../services/images/image-processing.service";
import { getImageConfig } from "../services/images/image-config";
import { imageType } from "./image-signature";

export type ListingPhotoUpload = {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ListingImageOrderItem =
  | { kind: "existing"; id: string; isPrimary: boolean }
  | { kind: "upload"; index: number; isPrimary: boolean }
  | { kind: "prepared"; id: string; isPrimary: boolean };

const maxPhotos = 10;
const maxPhotoBytes = () => Math.min(8, getImageConfig().maxFileMb) * 1024 * 1024;
const maxRequestBytes = () => maxPhotos * maxPhotoBytes() + 1024 * 1024;
const imageOrderSchema = z.array(z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: idSchema, isPrimary: z.boolean() }).strict(),
  z.object({ kind: z.literal("upload"), index: z.number().int().min(0).max(maxPhotos - 1), isPrimary: z.boolean() }).strict(),
  z.object({ kind: z.literal("prepared"), id: z.string().uuid(), isPrimary: z.boolean() }).strict(),
])).max(20).refine((items) => items.filter((item) => item.isPrimary).length <= 1);

export const readBoundedRequestBody = (event: H3Event, limit: number, message: string) => new Promise<Buffer>((resolve, reject) => {
  const request = event.node.req;
  const chunks: Buffer[] = [];
  let total = 0;
  let overflowed = false;

  const onData = (chunk: Buffer | string) => {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += data.length;
    if (total > limit) {
      if (!overflowed) {
        overflowed = true;
        reject(createError({ statusCode: 413, statusMessage: message }));
      }
      return;
    }
    if (!overflowed) chunks.push(data);
  };
  const cleanup = () => {
    request.removeListener("data", onData);
    request.removeListener("end", onEnd);
    request.removeListener("error", onError);
  };
  const onEnd = () => {
    cleanup();
    if (!overflowed) resolve(Buffer.concat(chunks, total));
  };
  const onError = (error: Error) => {
    cleanup();
    if (!overflowed) reject(error);
  };

  request.on("data", onData);
  request.on("end", onEnd);
  request.on("error", onError);
});

const parseJsonField = (value: Buffer | undefined, field: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value.toString("utf8")) as unknown;
  } catch {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${field} data.` });
  }
};

export const readListingSubmission = async (event: H3Event) => {
  const contentType = getRequestHeader(event, "content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    const raw: unknown = await readBody(event);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { body: raw, photos: [] as ListingPhotoUpload[], imageOrder: undefined as ListingImageOrderItem[] | undefined };
    }
    const { imageOrder, ...body } = raw as Record<string, unknown>;
    const parsedOrder = imageOrder === undefined ? undefined : imageOrderSchema.safeParse(imageOrder);
    if (parsedOrder && !parsedOrder.success) {
      throw createError({ statusCode: 400, statusMessage: "Check the selected photos and their order." });
    }
    return { body, photos: [] as ListingPhotoUpload[], imageOrder: parsedOrder?.success ? parsedOrder.data : undefined };
  }

  const contentLength = Number(getRequestHeader(event, "content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes()) {
    throw createError({ statusCode: 413, statusMessage: "Photo upload exceeds the maximum request size." });
  }

  const body = await readBoundedRequestBody(event, maxRequestBytes(), "Photo upload exceeds the maximum request size.");
  const bytes = new Uint8Array(body.length);
  bytes.set(body);
  event._requestBody = new Blob([bytes.buffer]).stream();
  const parts = await readMultipartFormData(event);
  if (!parts) throw createError({ statusCode: 400, statusMessage: "Listing form data is missing." });
  const fields = new Map<string, Buffer>();
  const photos: ListingPhotoUpload[] = [];

  for (const part of parts) {
    if (part.name === "photos" && part.filename !== undefined) {
      if (photos.length >= maxPhotos) {
        throw createError({ statusCode: 400, statusMessage: `You can upload up to ${maxPhotos} photos.` });
      }
      if (part.data.length > maxPhotoBytes()) {
        throw createError({ statusCode: 413, statusMessage: `Each photo must be ${maxPhotoBytes() / 1024 / 1024} MB or smaller.` });
      }
      const mimeType = imageType(part.data);
      if (!mimeType) {
        throw createError({ statusCode: 400, statusMessage: "Photos must be valid JPEG, PNG or WebP images." });
      }
      try {
        const processed = await processCarGalleryImage(part.data);
        photos.push({ data: processed.data, mimeType: processed.mimeType });
      } catch (error) {
        if (error instanceof ImageProcessingBusyError) {
          setResponseHeader(event, "Retry-After", 5);
          throw createError({ statusCode: 503, statusMessage: error.message });
        }
        if (error instanceof ImageValidationError) {
          throw createError({ statusCode: 400, statusMessage: "Photos must be valid, non-animated JPEG, PNG or WebP images within the size limits." });
        }
        throw error;
      }
      continue;
    }

    if (!part.name || !["listing", "status", "imageOrder"].includes(part.name) || fields.has(part.name)) {
      throw createError({ statusCode: 400, statusMessage: "Listing form contains an invalid field." });
    }
    fields.set(part.name, part.data);
  }

  const listingValue = parseJsonField(fields.get("listing"), "listing");
  if (listingValue === undefined) throw createError({ statusCode: 400, statusMessage: "Listing details are missing." });
  const imageOrderValue = parseJsonField(fields.get("imageOrder"), "photo order");
  const parsedOrder = imageOrderValue === undefined ? undefined : imageOrderSchema.safeParse(imageOrderValue);
  if (parsedOrder && !parsedOrder.success) {
    throw createError({ statusCode: 400, statusMessage: "Check the selected photos and their order." });
  }

  return {
    body: { listing: listingValue, status: fields.get("status")?.toString("utf8") },
    photos,
    imageOrder: parsedOrder?.success ? parsedOrder.data : undefined,
  };
};
