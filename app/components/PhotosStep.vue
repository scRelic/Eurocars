<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, Images, Star, Trash2, UploadCloud } from "@lucide/vue";
import type { DraftPhoto } from "~/composables/useCarListingForm";

defineProps<{ images: DraftPhoto[]; error: string; maxPhotos: number; maxPhotoMb: number; blobEnabled: boolean }>();
const emit = defineEmits<{
  add: [files: FileList];
  remove: [id: string];
  primary: [id: string];
  move: [id: string, direction: -1 | 1];
  retry: [id: string];
}>();
const isDragging = ref(false);

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) emit("add", input.files);
  input.value = "";
};

const onDrop = (event: DragEvent) => {
  isDragging.value = false;
  if (event.dataTransfer?.files.length) emit("add", event.dataTransfer.files);
};
</script>

<template>
  <section>
    <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Step 03 · Photos</p>
    <h2 class="mt-2 text-2xl font-bold tracking-tight text-slate-950">Show your car</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Good photos help buyers understand your car's condition.</p>
    <p class="mt-4 text-sm text-slate-600">Add up to {{ maxPhotos }} JPEG, PNG or WebP photos. Maximum {{ maxPhotoMb }} MB per photo.</p>
    <div v-if="images.length" class="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <article v-for="(image, index) in images" :key="image.id" class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="relative">
          <SafeImage :src="image.url" :alt="`Listing photo ${index + 1}`" width="640" height="480" class="aspect-[4/3] w-full bg-slate-100 object-cover" />
          <span v-if="image.isPrimary" class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-sm">
            <Star class="h-3 w-3 fill-blue-600 text-blue-600" aria-hidden="true" /> Main photo
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-1 p-2">
          <button v-if="!image.isPrimary" type="button" :aria-label="`Set photo ${index + 1} as main`" class="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600" @click="emit('primary', image.id)">
            <Check class="h-3.5 w-3.5" aria-hidden="true" /> Set main
          </button>
          <span v-else class="flex min-h-9 flex-1 items-center px-2 text-xs font-semibold text-slate-500">Main photo</span>
          <button type="button" :disabled="index === 0" :aria-label="`Move photo ${index + 1} earlier`" class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40" @click="emit('move', image.id, -1)">
            <ArrowUp class="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" :disabled="index === images.length - 1" :aria-label="`Move photo ${index + 1} later`" class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40" @click="emit('move', image.id, 1)">
            <ArrowDown class="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" :aria-label="`Remove photo ${index + 1}`" class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600" @click="emit('remove', image.id)">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p v-if="image.file" class="truncate px-3 pb-3 text-xs text-slate-500">{{ image.file.name }}</p>
        <div v-if="image.uploadStatus" class="px-3 pb-3 text-xs text-slate-600" role="status">
          <p>{{ image.uploadStatus }}<template v-if="image.uploadStatus === 'Uploading' && image.progress !== undefined"> {{ Math.round(image.progress) }}%</template></p>
          <progress v-if="image.uploadStatus === 'Uploading' && image.progress !== undefined" :value="image.progress" max="100" :aria-label="`Photo ${index + 1} upload progress`" class="mt-1 w-full" />
          <p v-if="image.uploadError" class="mt-1 text-red-700">{{ image.uploadError }}</p>
          <button v-if="image.uploadStatus === 'Failed'" type="button" class="mt-1 cursor-pointer font-semibold text-blue-700 underline" @click="emit('retry', image.id)">Retry upload</button>
        </div>
      </article>
    </div>
    <label
      class="mt-7 flex flex-col items-center rounded-2xl border-2 border-dashed px-5 py-10 text-center transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600"
      :class="[isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50', images.length >= maxPhotos ? 'cursor-not-allowed' : 'cursor-pointer']"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm"><UploadCloud class="h-6 w-6" aria-hidden="true" /></span>
      <span class="mt-4 font-bold text-slate-900">{{ images.length >= maxPhotos ? "Photo limit reached" : "Drag photos here or browse files" }}</span>
      <span class="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Images class="h-4 w-4" aria-hidden="true" />Choose your best view as the main photo</span>
      <span class="mt-2 text-sm text-slate-500">{{ images.length }} of {{ maxPhotos }} photos selected</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" aria-label="Choose listing photos" :disabled="images.length >= maxPhotos" @change="onFileChange">
    </label>
    <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>
    <p class="mt-4 text-xs leading-5 text-slate-500">{{ blobEnabled ? "Photos upload securely as you select them. Remove a photo to cancel its upload." : "Photos upload securely when you save the listing. Existing photos are preserved when you edit." }}</p>
  </section>
</template>
