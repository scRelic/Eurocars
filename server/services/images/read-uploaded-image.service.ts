import type { GetBlobResult } from "@vercel/blob";

type PrivateImageStore = {
  getImage(pathname: string, signal?: AbortSignal): Promise<GetBlobResult | null>;
};

export const readUploadedImage = async (
  store: PrivateImageStore,
  pathname: string,
  expectedSize: number,
  expectedMimeType: string,
  signal?: AbortSignal,
) => {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 10 * 1024 * 1024) {
    throw new Error("Invalid expected upload size.");
  }
  const result = await store.getImage(pathname, signal);
  if (!result || result.statusCode !== 200) throw new Error("Uploaded image is unavailable.");
  if (result.blob.pathname !== pathname || result.blob.size !== expectedSize
    || result.blob.contentType !== expectedMimeType) {
    await result.stream.cancel();
    throw new Error("Uploaded image metadata does not match the session.");
  }

  const reader = result.stream.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > expectedSize) {
        await reader.cancel();
        throw new Error("Uploaded image exceeds the expected size.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== expectedSize) throw new Error("Uploaded image size does not match the session.");
  return Buffer.concat(chunks, length);
};
