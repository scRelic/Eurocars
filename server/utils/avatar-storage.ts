import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createError } from "h3";
import { imageType } from "./image-signature.ts";
import { readBoundedFile } from "./bounded-file.ts";

const userIdPattern = /^[1-9]\d{0,18}$/;
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const directory = () => resolve(process.env.AVATAR_STORAGE_DIR || join(process.cwd(), ".data", "avatars"));

export const avatarUrl = (userId: string, token: string) => `/api/users/${userId}/avatar/${token}`;

const filePath = (userId: string, token: string) => {
  if (!userIdPattern.test(userId) || !tokenPattern.test(token)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid avatar identifier." });
  }
  return join(directory(), userId, token);
};

export const saveAvatarFile = async (userId: string, token: string, data: Buffer) => {
  const path = filePath(userId, token);
  await mkdir(join(directory(), userId), { recursive: true, mode: 0o700 });
  await writeFile(path, data, { flag: "wx", mode: 0o600 });
};

export const removeAvatarFile = async (userId: string, token: string) => {
  try {
    await unlink(filePath(userId, token));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
};

export const removePreviousAvatar = async (userId: string, url: string | null) => {
  if (!url) return;
  const prefix = `/api/users/${userId}/avatar/`;
  if (!url.startsWith(prefix)) return;
  const token = url.slice(prefix.length);
  if (!tokenPattern.test(token)) return;
  try {
    await removeAvatarFile(userId, token);
  } catch {
    console.error("Could not remove a previous avatar file.");
  }
};

export const readAvatarFile = async (userId: string, token: string, maximumBytes?: number) => {
  let data: Buffer;
  try {
    data = maximumBytes ? await readBoundedFile(filePath(userId, token), maximumBytes) : await readFile(filePath(userId, token));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const mimeType = imageType(data);
  if (!mimeType) throw createError({ statusCode: 415, statusMessage: "Stored avatar is not a supported image." });
  return { data, mimeType };
};
