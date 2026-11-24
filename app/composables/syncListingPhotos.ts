export const syncListingPhotos = async (carId: string, images: { id: string }[]) => {
  let pending = 0;
  for (const image of images) {
    try {
      const result = await $fetch<{ pending: boolean }>(`/api/cars/${carId}/images/${image.id}/sync`, { method: "POST" });
      if (result.pending) pending++;
    } catch {
      pending++;
      console.error(`Image synchronization failed for listing photo ${image.id}; retry remains scheduled.`);
    }
  }
  return pending;
};
