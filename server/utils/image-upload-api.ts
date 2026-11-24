import type { H3Event } from "h3";
import { z } from "zod";
import { readBoundedRequestBody } from "./listing-image-upload";

export const uploadIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

export const readUploadJson = async (event: H3Event) => {
  if (!(getRequestHeader(event, "content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw createError({ statusCode: 415, statusMessage: "A JSON request is required." });
  }
  const data = await readBoundedRequestBody(event, 16 * 1024, "Upload request is too large.");
  try {
    return JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid upload request." });
  }
};

export const privateBlobToken = () => {
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (!token?.trim()) throw createError({ statusCode: 503, statusMessage: "Image storage is unavailable." });
  return token;
};
