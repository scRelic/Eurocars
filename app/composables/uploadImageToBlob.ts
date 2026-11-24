type UploadOptions = {
  signal?: AbortSignal;
  onStatus?: (status: "Preparing" | "Uploading" | "Processing" | "Ready", progress?: number) => void;
};

export const cancelImageUpload = async (id: string) => {
  try {
    await $fetch(`/api/uploads/${id}`, { method: "DELETE" });
  } catch {
    console.error("Could not cancel the image upload; its cleanup remains scheduled.");
  }
};

export const uploadImageToBlob = async (file: File, purpose: "LISTING" | "AVATAR", options?: UploadOptions) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP image.");
  }
  let uploadId: string | undefined;
  try {
    options?.onStatus?.("Preparing");
    const session = await $fetch<{ id: string; pathname: string }>("/api/uploads/prepare", {
      method: "POST",
      body: { purpose, size: file.size, contentType: file.type },
      signal: options?.signal,
    });
    uploadId = session.id;
    const { upload } = await import("@vercel/blob/client");
    options?.onStatus?.("Uploading");
    let uploading = true;
    try {
      await upload(session.pathname, file, {
        access: "private",
        handleUploadUrl: "/api/uploads/blob",
        clientPayload: session.id,
        contentType: file.type,
        multipart: false,
        abortSignal: options?.signal,
        onUploadProgress: ({ percentage }) => {
          if (uploading) options?.onStatus?.("Uploading", percentage);
        },
      });
    } finally {
      uploading = false;
    }
    options?.onStatus?.("Processing");
    await $fetch("/api/uploads/complete", {
      method: "POST", body: { id: session.id }, signal: options?.signal, retry: 1,
    });
    options?.onStatus?.("Ready");
    return session.id;
  } catch (error) {
    if (uploadId) await cancelImageUpload(uploadId);
    throw error;
  }
};
