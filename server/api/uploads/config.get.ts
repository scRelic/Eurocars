import { getImageConfig } from "../../services/images/image-config";

export default defineEventHandler((event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  const config = getImageConfig();
  return {
    avatarBlobEnabled: process.env.BLOB_AVATAR_ENABLED === "true",
    listingBlobEnabled: process.env.BLOB_LISTING_ENABLED === "true",
    maxCount: config.maxCount,
    maxFileMb: config.maxFileMb,
  };
});
