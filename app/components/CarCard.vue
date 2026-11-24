<script setup lang="ts">
import { CalendarDays, CarFront, Cog, Fuel, Gauge, Heart, MapPin } from "@lucide/vue";
import type { Car } from "~/data/cars";

const props = defineProps<{
  car: Car;
  layout?: "grid" | "list";
}>();

const { items, loading, busyIds, toggle } = useFavorites();
const isSaved = computed(() => items.value.some((item) => item.id === props.car.id));
const imageFailed = ref(false);
const thumbnailFailed = ref(false);
const imageElement = ref<HTMLImageElement | null>(null);
watch(() => [props.car.image, props.car.imageThumbnail], () => { imageFailed.value = false; thumbnailFailed.value = false; });
const handleImageError = (image: HTMLImageElement) => {
  const thumbnail = props.car.imageThumbnail;
  if (thumbnail && !thumbnailFailed.value
    && image.currentSrc === new URL(thumbnail, window.location.href).href) {
    thumbnailFailed.value = true;
  } else {
    imageFailed.value = true;
  }
};
const onImageError = (event: Event) => {
  if (event.target instanceof HTMLImageElement) handleImageError(event.target);
};
onMounted(() => {
  const image = imageElement.value;
  if (image?.currentSrc && image.complete && !image.naturalWidth) handleImageError(image);
});
const actionError = ref("");
const toggleSaved = async () => {
  actionError.value = "";
  try {
    await toggle(props.car.id);
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, error instanceof Error ? error.message : "Unable to update saved cars.");
  }
};

const formatPrice = (price: number, currency = "EUR") => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);

const formatMileage = (mileage: number) => new Intl.NumberFormat("en-GB").format(mileage);
const formatLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
</script>

<template>
  <article class="group relative overflow-hidden rounded-2xl border border-brand-border bg-white transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-brand-navy/10">
    <NuxtLink :to="`/cars/${car.id}`" class="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue" :class="layout === 'list' ? 'sm:flex' : ''">
    <div class="relative aspect-[16/10] overflow-hidden bg-slate-100" :class="layout === 'list' ? 'sm:w-64 sm:shrink-0 lg:w-72' : ''">
      <picture v-if="car.image && !imageFailed">
        <source v-if="car.imageThumbnail && !thumbnailFailed" media="(max-width: 480px)" :srcset="car.imageThumbnail">
        <img
          ref="imageElement"
          :src="car.image"
          :alt="`${car.make} ${car.model} ${car.year}`"
          class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          width="640" height="400"
          loading="lazy"
          @error="onImageError">
      </picture>
      <div v-else class="flex h-full items-center justify-center text-slate-300">
        <CarFront class="h-12 w-12" aria-hidden="true" />
        <span class="sr-only">{{ car.make }} {{ car.model }} photo unavailable</span>
      </div>
      <span class="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-navy/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"><MapPin class="h-3 w-3" aria-hidden="true" />{{ car.city }}, {{ car.country }}</span>
      <span v-if="car.dealer?.isVerified" class="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm">Verified Dealer</span>
    </div>

    <div class="min-w-0 flex-1 p-5">
      <p class="text-xl font-bold tracking-tight text-brand-navy">{{ formatPrice(car.price, car.currency) }}</p>
      <h3 class="mt-2 pr-7 text-base font-bold text-brand-navy">{{ car.make }} {{ car.model }}</h3>
      <p v-if="car.trim" class="mt-1 text-sm text-slate-500">{{ car.trim }}</p>

      <div class="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <span class="inline-flex items-center gap-1.5"><CalendarDays class="h-4 w-4 text-slate-400" aria-hidden="true" />{{ car.year }}</span>
        <span class="inline-flex items-center gap-1.5"><Gauge class="h-4 w-4 text-slate-400" aria-hidden="true" />{{ formatMileage(car.mileage) }} km</span>
        <span v-if="car.fuel" class="inline-flex items-center gap-1.5"><Fuel class="h-4 w-4 text-slate-400" aria-hidden="true" />{{ formatLabel(car.fuel) }}</span>
        <span v-if="car.transmission" class="inline-flex items-center gap-1.5"><Cog class="h-4 w-4 text-slate-400" aria-hidden="true" />{{ formatLabel(car.transmission) }}</span>
      </div>
    </div>
    </NuxtLink>
    <button
      type="button"
      class="absolute right-3 top-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-slate-600 shadow-md transition hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-60"
      :aria-label="isSaved ? `Remove ${car.make} ${car.model} from favorites` : `Save ${car.make} ${car.model} to favorites`"
      :aria-pressed="isSaved"
      :disabled="loading || busyIds.includes(car.id)"
      @click="toggleSaved">
      <Heart class="h-5 w-5" :class="isSaved ? 'fill-rose-500 text-rose-500' : ''" aria-hidden="true" />
    </button>
    <p v-if="actionError" role="alert" class="px-5 pb-4 text-sm text-red-700">{{ actionError }}</p>
  </article>
</template>
