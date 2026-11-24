import { del, get, head, put } from "@vercel/blob";

type Access = "public" | "private";

const validatePathname = (pathname: string) => {
  if (!pathname || pathname.length > 512 || !/^[a-zA-Z0-9/_\-.]+$/.test(pathname)
    || pathname.startsWith("/") || pathname.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid storage pathname.");
  }
};

export class VercelBlobStore {
  private readonly access: Access;
  private readonly token: string;

  constructor(access: Access, token: string) {
    if (!token.trim()) throw new Error(`Missing ${access} Blob store token.`);
    this.access = access;
    this.token = token;
  }

  async uploadImage(pathname: string, data: Buffer, contentType: string, signal?: AbortSignal) {
    validatePathname(pathname);
    return put(pathname, data, {
      access: this.access,
      token: this.token,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: signal ?? AbortSignal.timeout(60_000),
    });
  }

  async getImage(pathname: string, signal?: AbortSignal) {
    validatePathname(pathname);
    return get(pathname, { access: this.access, token: this.token, useCache: false, abortSignal: signal ?? AbortSignal.timeout(60_000) });
  }

  async getImageMetadata(pathname: string, signal?: AbortSignal) {
    validatePathname(pathname);
    return head(pathname, { token: this.token, abortSignal: signal ?? AbortSignal.timeout(60_000) });
  }

  async deleteImages(pathnames: string[]) {
    if (!pathnames.length) return;
    for (const pathname of pathnames) validatePathname(pathname);
    await del(pathnames, { token: this.token, abortSignal: AbortSignal.timeout(60_000) });
  }

  ownsPublicUrl(url: string, pathname: string) {
    if (this.access !== "public") return false;
    validatePathname(pathname);
    const storeId = this.token.split("_")[3];
    if (!storeId || !/^[a-zA-Z0-9-]+$/.test(storeId)) throw new Error("Invalid public Blob store token.");
    return url === `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com/${pathname}`;
  }
}
