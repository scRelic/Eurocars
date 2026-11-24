const integerSetting = (name: string, fallback: number, maximum: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`Invalid ${name}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) throw new Error(`Invalid ${name}.`);
  return value;
};

export const getImageConfig = () => {
  const config = {
    maxFileMb: integerSetting("IMAGE_MAX_FILE_SIZE_MB", 10, 10),
    maxCount: integerSetting("IMAGE_MAX_COUNT", 20, 20),
    maxWidth: integerSetting("IMAGE_MAX_WIDTH", 1920, 1920),
    webpQuality: integerSetting("IMAGE_WEBP_QUALITY", 82, 100),
    thumbnailWidth: integerSetting("IMAGE_THUMBNAIL_WIDTH", 320, 1920),
    catalogWidth: integerSetting("IMAGE_CATALOG_WIDTH", 640, 1920),
    avatarSize: integerSetting("IMAGE_AVATAR_SIZE", 256, 256),
  };
  if (config.thumbnailWidth > config.catalogWidth || config.catalogWidth > config.maxWidth) {
    throw new Error("Image widths must satisfy thumbnail <= catalog <= maximum.");
  }
  return config;
};
