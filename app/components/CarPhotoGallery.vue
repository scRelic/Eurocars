<script setup lang="ts">
import { Camera, ChevronLeft, ChevronRight, Maximize2, X } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  photos: string[];
  previews?: string[];
  catalog?: string[];
  carName: string;
}>();

const activeIndex = ref(0);
const isOpen = ref(false);
const failedPhotos = ref(new Set<string>());
const mainImage = ref<HTMLImageElement | null>(null);
const markFailed = (photo: string) => { failedPhotos.value = new Set(failedPhotos.value).add(photo); };
const previewSource = (photo: string, index: number) => {
  const preview = props.previews?.[index];
  return preview && !failedPhotos.value.has(preview) ? preview : photo;
};
const handleMainError = (image: HTMLImageElement) => {
  const catalog = props.catalog?.[activeIndex.value];
  if (catalog && !failedPhotos.value.has(catalog)
    && image.currentSrc === new URL(catalog, window.location.href).href) {
    markFailed(catalog);
  } else if (currentPhoto.value) {
    markFailed(currentPhoto.value);
  }
};
const onMainError = (event: Event) => {
  if (event.target instanceof HTMLImageElement) handleMainError(event.target);
};
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
const currentPhoto = computed(() => props.photos[activeIndex.value] ?? props.photos[0]);
const currentCatalog = computed(() => props.catalog?.[activeIndex.value]);
const photoCount = computed(() => props.photos.length);

const showPhoto = (index: number) => {
  if (!photoCount.value) {
    return;
  }
  activeIndex.value = (index + photoCount.value) % photoCount.value;
};

const previousPhoto = () => {
  showPhoto(activeIndex.value - 1);
};

const nextPhoto = () => {
  showPhoto(activeIndex.value + 1);
};

const openGallery = async () => {
  if (!photoCount.value) {
    return;
  }
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  isOpen.value = true;
  document.body.style.overflow = "hidden";
  await nextTick();
  closeButton.value?.focus();
};

const closeGallery = () => {
  if (!isOpen.value) return;
  isOpen.value = false;
  document.body.style.overflow = previousOverflow;
  if (previousFocus?.isConnected) previousFocus.focus();
};

const onKeydown = (event: KeyboardEvent) => {
  if (!isOpen.value) {
    return;
  }
  if (event.key === "Escape") {
    closeGallery();
  } else if (event.key === "ArrowLeft") {
    previousPhoto();
  } else if (event.key === "ArrowRight") {
    nextPhoto();
  } else if (event.key === "Tab") {
    const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) event.preventDefault();
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
};

watch(() => props.photos, () => {
  activeIndex.value = 0;
  failedPhotos.value = new Set();
  if (isOpen.value) closeGallery();
});
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  const image = mainImage.value;
  if (image?.currentSrc && image.complete && !image.naturalWidth) handleMainError(image);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (isOpen.value) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <section aria-label="Car photos" class="min-w-0">
    <div v-if="currentPhoto" class="grid gap-3" :class="photos.length > 1 ? 'lg:grid-cols-[minmax(0,1fr)_220px]' : 'grid-cols-1'">
      <button
        type="button"
        class="group relative block min-w-0 cursor-pointer overflow-hidden rounded-2xl bg-gray-200 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        aria-label="Open full-screen photo gallery"
        @click="openGallery"
      >
        <picture v-if="!failedPhotos.has(currentPhoto)">
          <source v-if="currentCatalog && !failedPhotos.has(currentCatalog)" media="(max-width: 640px)" :srcset="currentCatalog">
          <img
            ref="mainImage"
            :src="currentPhoto"
            :alt="`${carName} — photo ${activeIndex + 1}`"
            class="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:aspect-[16/9] lg:aspect-[4/3]"
            width="1920" height="1440"
            @error="onMainError"
          >
        </picture>
        <span v-else class="flex aspect-[4/3] items-center justify-center text-sm text-gray-600">Photo unavailable</span>
        <span class="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-gray-950/75 px-3 py-2 text-xs font-medium text-white backdrop-blur">
          <Camera class="h-4 w-4" aria-hidden="true" />
          {{ activeIndex + 1 }} / {{ photoCount }} photos
        </span>
        <span class="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition group-hover:bg-blue-600 group-hover:text-white">
          <Maximize2 class="h-4 w-4" aria-hidden="true" />
          View all photos
        </span>
      </button>

      <div v-if="photos.length > 1" class="hidden auto-rows-fr gap-3 lg:grid">
        <button
          v-for="(photo, index) in photos.slice(0, 4)"
          :key="photo"
          type="button"
          class="group relative min-h-0 cursor-pointer overflow-hidden rounded-2xl bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          :aria-label="`View photo ${index + 1}`"
          :aria-pressed="activeIndex === index"
          @click="showPhoto(index)"
        >
          <img
            v-if="!failedPhotos.has(previewSource(photo, index))"
            :src="previewSource(photo, index)"
            :alt="`${carName} — photo ${index + 1}`"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            width="320" height="240" loading="lazy"
            @error="markFailed(previewSource(photo, index))"
          >
          <span v-else class="flex h-full items-center justify-center text-xs text-gray-600">Photo unavailable</span>
        </button>
      </div>
    </div>

    <div v-else class="flex aspect-[16/9] items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-500">
      No photos available
    </div>

    <div v-if="photos.length > 1" class="mt-3 flex gap-3 overflow-x-auto pb-1 lg:hidden">
      <button
        v-for="(photo, index) in photos"
        :key="photo"
        type="button"
        class="w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 transition"
        :class="activeIndex === index ? 'border-blue-600' : 'border-transparent'"
        :aria-label="`View photo ${index + 1}`"
        :aria-pressed="activeIndex === index"
        @click="showPhoto(index)"
      >
        <img v-if="!failedPhotos.has(previewSource(photo, index))" :src="previewSource(photo, index)" :alt="`${carName} — photo ${index + 1}`" class="aspect-[4/3] w-full object-cover" width="320" height="240" loading="lazy" @error="markFailed(previewSource(photo, index))">
        <span v-else class="flex aspect-[4/3] items-center justify-center text-xs text-gray-600">Photo unavailable</span>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen && currentPhoto"
        ref="dialog"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/95 p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label="Full-screen car photo gallery"
        @click.self="closeGallery"
      >
        <button
          ref="closeButton"
          type="button"
          class="absolute right-4 top-4 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:right-8 sm:top-8"
          aria-label="Close photo gallery"
          @click="closeGallery"
        >
          <X class="h-6 w-6" aria-hidden="true" />
        </button>

        <p class="absolute left-4 top-5 text-sm font-medium text-white sm:left-8 sm:top-9">
          {{ activeIndex + 1 }} / {{ photoCount }}
        </p>

        <button
          v-if="photoCount > 1"
          type="button"
          class="absolute left-3 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-8"
          aria-label="Previous photo"
          @click="previousPhoto"
        >
          <ChevronLeft class="h-6 w-6" aria-hidden="true" />
        </button>

        <img v-if="!failedPhotos.has(currentPhoto)" :src="currentPhoto" :alt="`${carName} — photo ${activeIndex + 1}`" class="max-h-[85vh] max-w-full rounded-xl object-contain" width="1920" height="1440" @error="markFailed(currentPhoto)">
        <p v-else class="text-white">Photo unavailable</p>

        <button
          v-if="photoCount > 1"
          type="button"
          class="absolute right-3 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-8"
          aria-label="Next photo"
          @click="nextPhoto"
        >
          <ChevronRight class="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </Teleport>
  </section>
</template>
