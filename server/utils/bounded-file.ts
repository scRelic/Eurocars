import { open } from "node:fs/promises";

export const readBoundedFile = async (path: string, maximumBytes: number) => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new Error("Invalid file size limit.");
  const file = await open(path, "r");
  try {
    const data = Buffer.allocUnsafe(maximumBytes + 1);
    let length = 0;
    while (length < data.length) {
      const { bytesRead } = await file.read(data, length, data.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximumBytes) throw new Error("Local image exceeds the size limit.");
    return data.subarray(0, length);
  } finally {
    await file.close();
  }
};
