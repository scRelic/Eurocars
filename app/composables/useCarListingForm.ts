import { onBeforeUnmount } from "vue";
import { listingSchema } from "~/../shared/validators/listing";
import type { Country, Listing, ListingFeature, ListingFormErrors, ListingFormState, ListingImage, LookupItem, WizardStep } from "~/../shared/types/listing";
import { cancelImageUpload, uploadImageToBlob } from "./uploadImageToBlob";
import { syncListingPhotos } from "./syncListingPhotos";

type PhotoUploadStatus = "Queued" | "Preparing" | "Uploading" | "Processing" | "Ready" | "Failed";
export type DraftPhoto = ListingImage & { file?: File; uploadId?: string; uploadStatus?: PhotoUploadStatus; progress?: number; uploadError?: string };

const stepFields: Record<WizardStep, (keyof ListingFormState)[]> = {
  1: ["brandId", "modelId", "trim", "year", "title", "condition", "bodyType"],
  2: ["mileage", "fuelType", "transmission", "engineCapacityCc", "powerHp", "exteriorColor", "interiorColor", "doors", "seats", "firstRegistration", "featureIds"],
  3: [],
  4: ["countryCode", "city", "postalCode", "price", "currency", "description"],
  5: [],
};

const fieldMessages: Partial<Record<keyof ListingFormState, string>> = {
  brandId: "Select a brand.", modelId: "Select a model for this brand.", title: "Enter a title of up to 255 characters.",
  year: "Enter a year between 1886 and 2100.", mileage: "Enter a whole number between 0 and 2,147,483,647.",
  price: "Enter a price between 0 and 999,999,999,999.99 with at most two decimal places.",
  countryCode: "Select a country.", city: "Enter a city of up to 150 characters.",
  engineCapacityCc: "Enter a positive whole number.", powerHp: "Enter a positive whole number.",
  doors: "Enter a whole number between 1 and 8.", seats: "Enter a whole number between 1 and 20.",
  firstRegistration: "Enter a valid registration date.", featureIds: "Select no more than 100 features.",
};

export const useCarListingForm = (initial?: Listing) => {
  const form = reactive<ListingFormState>(initial ? {
    brandId: initial.brandId, modelId: initial.modelId, dealerId: initial.dealerId, title: initial.title,
    trim: initial.trim, description: initial.description, price: initial.price, currency: initial.currency,
    year: initial.year, mileage: initial.mileage, fuelType: initial.fuelType, transmission: initial.transmission,
    bodyType: initial.bodyType, condition: initial.condition, engineCapacityCc: initial.engineCapacityCc,
    powerHp: initial.powerHp, doors: initial.doors, seats: initial.seats, firstRegistration: initial.firstRegistration,
    exteriorColor: initial.exteriorColor, interiorColor: initial.interiorColor, countryCode: initial.countryCode,
    city: initial.city, postalCode: initial.postalCode, featureIds: [...initial.featureIds],
  } : {
    brandId: "", modelId: "", dealerId: null, title: "", trim: "", description: "", price: null,
    currency: "EUR", year: null, mileage: null, fuelType: "PETROL", transmission: "MANUAL", bodyType: null,
    condition: "USED", engineCapacityCc: null, powerHp: null, doors: null, seats: null, firstRegistration: null,
    exteriorColor: "", interiorColor: "", countryCode: "", city: "", postalCode: "", featureIds: [],
  });
  const requestFetch = useRequestFetch();
  const imageConfig = useAsyncData("image-upload-config", () =>
    requestFetch<{ listingBlobEnabled: boolean; maxCount: number; maxFileMb: number }>("/api/uploads/config"));
  const blobEnabled = computed(() => imageConfig.data.value?.listingBlobEnabled === true);
  const maxPhotos = computed(() => blobEnabled.value ? Math.max(initial?.images.length ?? 0, imageConfig.data.value!.maxCount) : 10);
  const maxPhotoMb = computed(() => blobEnabled.value ? imageConfig.data.value!.maxFileMb : Math.min(8, imageConfig.data.value?.maxFileMb ?? 8));
  const lookupState = useAsyncData("listing-lookups", async () => {
    const [brands, countries, features] = await Promise.all([
      requestFetch<{ items: LookupItem[] }>("/api/brands"),
      requestFetch<{ items: Country[] }>("/api/countries"),
      requestFetch<{ items: ListingFeature[] }>("/api/features"),
    ]);
    return { brands: brands.items, countries: countries.items, features: features.items };
  });
  const modelState = useAsyncData(
    () => `listing-models-${form.brandId || "none"}`,
    () => form.brandId
      ? requestFetch<{ items: LookupItem[] }>(`/api/brands/${form.brandId}/models`)
      : Promise.resolve({ items: [] as LookupItem[] }),
  );
  watch(() => form.brandId, (brand, previous) => {
    if (brand !== previous) form.modelId = "";
  }, { flush: "sync" });

  const errors = reactive<ListingFormErrors>({});
  const step = ref<WizardStep>(1);
  const isSaving = ref(false);
  const saved = ref(false);
  const saveError = ref("");
  const photoError = ref("");
  const photos = ref<DraftPhoto[]>(initial?.images.map((image) => ({ ...image })) ?? []);
  const idempotencyKey = ref("");
  const uploadControllers = new Map<string, AbortController>();
  let activeUploads = 0;
  let disposed = false;

  const pumpUploads = () => {
    if (disposed) return;
    while (activeUploads < 2) {
      const photo = photos.value.find((item) => item.uploadStatus === "Queued" && item.file);
      if (!photo?.file) break;
      const id = photo.id;
      const file = photo.file;
      const controller = new AbortController();
      uploadControllers.set(id, controller);
      photo.uploadStatus = "Preparing";
      activeUploads++;
      void uploadImageToBlob(file, "LISTING", {
        signal: controller.signal,
        onStatus: (status, progress) => {
          const current = photos.value.find((item) => item.id === id);
          if (current) { current.uploadStatus = status; current.progress = progress; }
        },
      }).then(async (uploadId) => {
        const current = photos.value.find((item) => item.id === id);
        if (!current || disposed) {
          await cancelImageUpload(uploadId);
        } else {
          current.uploadId = uploadId;
          current.uploadStatus = "Ready";
        }
      }).catch((error: unknown) => {
        const current = photos.value.find((item) => item.id === id);
        if (current) {
          current.uploadStatus = "Failed";
          current.uploadError = getAuthErrorMessage(error, "Unable to upload this photo. Please retry.");
        }
      }).finally(() => {
        activeUploads--;
        uploadControllers.delete(id);
        pumpUploads();
      });
    }
  };

  const addPhotos = (files: FileList | File[]) => {
    photoError.value = "";
    if (!imageConfig.data.value) {
      photoError.value = "Image upload settings are unavailable. Please reload and try again.";
      return;
    }
    const availableSlots = maxPhotos.value - photos.value.length;
    for (const file of Array.from(files)) {
      if (photos.value.length >= maxPhotos.value) {
        photoError.value = `You can upload up to ${maxPhotos.value} photos.`;
        break;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        photoError.value = "Photos must be JPEG, PNG or WebP images.";
        continue;
      }
      if (!file.size || file.size > maxPhotoMb.value * 1024 * 1024) {
        photoError.value = `Each photo must be non-empty and ${maxPhotoMb.value} MB or smaller.`;
        continue;
      }
      photos.value.push({
        id: `upload-${crypto.randomUUID()}`,
        url: URL.createObjectURL(file),
        isPrimary: photos.value.length === 0,
        file,
        ...(blobEnabled.value ? { uploadStatus: "Queued" as const } : {}),
      });
    }
    if (availableSlots === 0 && files.length) photoError.value = `You can upload up to ${maxPhotos.value} photos.`;
    if (blobEnabled.value) pumpUploads();
  };
  const removePhoto = (id: string) => {
    const index = photos.value.findIndex((photo) => photo.id === id);
    if (index < 0) return;
    photoError.value = "";
    const [removed] = photos.value.splice(index, 1);
    uploadControllers.get(id)?.abort();
    if (removed?.uploadId) void cancelImageUpload(removed.uploadId);
    if (removed?.file) URL.revokeObjectURL(removed.url);
    if (removed?.isPrimary && photos.value[0]) photos.value[0].isPrimary = true;
  };
  const retryPhoto = (id: string) => {
    const photo = photos.value.find((item) => item.id === id);
    if (!photo?.file || photo.uploadStatus !== "Failed") return;
    photo.uploadStatus = "Queued";
    photo.uploadError = "";
    photo.progress = undefined;
    pumpUploads();
  };
  const setPrimaryPhoto = (id: string) => {
    photos.value = photos.value.map((photo) => ({ ...photo, isPrimary: photo.id === id }));
  };
  const movePhoto = (id: string, direction: -1 | 1) => {
    const index = photos.value.findIndex((photo) => photo.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= photos.value.length) return;
    const [photo] = photos.value.splice(index, 1);
    if (photo) photos.value.splice(target, 0, photo);
  };
  onBeforeUnmount(() => {
    disposed = true;
    for (const photo of photos.value) {
      uploadControllers.get(photo.id)?.abort();
      if (!saved.value && photo.uploadId) void cancelImageUpload(photo.uploadId);
      if (photo.file) URL.revokeObjectURL(photo.url);
    }
  });
  const validateStep = (target: WizardStep) => {
    const fields = stepFields[target];
    for (const field of fields) errors[field] = undefined;
    const result = listingSchema.safeParse(form);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && fields.includes(field as keyof ListingFormState)) {
          const key = field as keyof ListingFormState;
          errors[key] = fieldMessages[key] ?? "Please check this field.";
        }
      }
    }
    if (target === 1 && form.brandId && (modelState.status.value === "pending" || modelState.error.value)) {
      errors.modelId = "Models could not be verified. Please wait or retry.";
    } else if (target === 1 && form.modelId && !modelState.data.value?.items.some((item) => item.id === form.modelId)) {
      errors.modelId = fieldMessages.modelId;
    }
    if (target === 4 && form.countryCode && !lookupState.data.value?.countries.some((item) => item.code === form.countryCode)) {
      errors.countryCode = fieldMessages.countryCode;
    }
    return fields.every((field) => !errors[field]);
  };
  watch(form, () => {
    if (stepFields[step.value].some((field) => errors[field])) validateStep(step.value);
  }, { deep: true });
  const next = () => {
    if (step.value < 5 && validateStep(step.value)) step.value = (step.value + 1) as WizardStep;
  };
  const back = () => {
    if (step.value > 1) step.value = (step.value - 1) as WizardStep;
  };
  const submit = async (status: "DRAFT" | "PENDING") => {
    if (isSaving.value || saved.value) return;
    saveError.value = "";
    for (const target of [1, 2, 4] as const) {
      if (!validateStep(target)) {
        step.value = target;
        return;
      }
    }
    const parsed = listingSchema.safeParse(form);
    if (!parsed.success) {
      saveError.value = "Please check your listing details.";
      return;
    }
    if (blobEnabled.value && photos.value.some((photo) => photo.file && (photo.uploadStatus !== "Ready" || !photo.uploadId))) {
      saveError.value = "Wait for all photos to finish uploading, or retry or remove failed photos.";
      return;
    }
    isSaving.value = true;
    try {
      let uploadIndex = 0;
      const imageOrder = photos.value.map((photo) => {
        if (photo.file) {
          if (blobEnabled.value && photo.uploadId) {
            return { kind: "prepared", id: photo.uploadId, isPrimary: photo.isPrimary };
          }
          const index = uploadIndex++;
          return { kind: "upload", index, isPrimary: photo.isPrimary };
        }
        return { kind: "existing", id: photo.id, isPrimary: photo.isPrimary };
      });
      let body: FormData | { listing: typeof parsed.data; status: typeof status; imageOrder: typeof imageOrder };
      if (blobEnabled.value) {
        body = { listing: parsed.data, status, imageOrder };
      } else {
        body = new FormData();
        body.append("listing", JSON.stringify(parsed.data));
        body.append("status", status);
        for (const photo of photos.value) {
          if (photo.file) body.append("photos", photo.file, photo.file.name);
        }
        body.append("imageOrder", JSON.stringify(imageOrder));
      }

      let response: { listing: Listing };
      if (initial) {
        response = await $fetch<{ listing: Listing }>(`/api/cars/${initial.id}`, { method: "PATCH", body });
      } else {
        if (!idempotencyKey.value) idempotencyKey.value = crypto.randomUUID();
        response = await $fetch<{ listing: Listing }>("/api/cars", { method: "POST", body, headers: { "Idempotency-Key": idempotencyKey.value } });
      }
      saved.value = true;
      if (blobEnabled.value && await syncListingPhotos(response.listing.id, response.listing.images)) {
        saveError.value = "Your listing was saved, but some photos are awaiting synchronization. They will be retried.";
      }
    } catch (error) {
      saveError.value = getAuthErrorMessage(error, "Unable to save your listing. Please try again.");
    } finally {
      isSaving.value = false;
    }
    if (saved.value && !saveError.value) {
      try {
        await navigateTo("/account/listings");
      } catch {
        saveError.value = "Your listing was saved, but we couldn't open your listings. Use the link below.";
      }
    }
  };

  return {
    form, errors, step, next, back, submit, isSaving, saved, saveError, validateStep, photos, photoError,
    addPhotos, removePhoto, retryPhoto, setPrimaryPhoto, movePhoto, maxPhotos, maxPhotoMb, blobEnabled,
    lookups: lookupState.data, lookupError: lookupState.error, lookupStatus: lookupState.status,
    refreshLookups: lookupState.refresh, models: modelState.data, modelError: modelState.error,
    modelStatus: modelState.status, refreshModels: modelState.refresh,
    ready: Promise.all([lookupState, modelState, imageConfig]),
  };
};
