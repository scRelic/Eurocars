<script setup lang="ts">
import {
  CalendarDays,
  CarFront,
  Check,
  Cog,
  Fuel,
  Gauge,
  Heart,
  MapPin,
  Navigation,
  Palette,
  Share2,
  Sun,
  Thermometer,
  Zap,
  Lightbulb,
  Camera,
  UserRound,
  Eye,
} from "@lucide/vue";
import type { Component } from "vue";
import type { Car } from "~/data/cars";

definePageMeta({ key: (route) => route.path });

const route = useRoute();
const requestFetch = useRequestFetch();
const listingId = ref(typeof route.params.id === "string" && /^[1-9]\d{0,18}$/.test(route.params.id) ? route.params.id : "");
const { data: publicListing, error: publicListingError } = await useAsyncData(
  `public-car-${listingId.value}`,
  () => listingId.value ? requestFetch<{ car: Car }>(`/api/cars/${listingId.value}`) : Promise.resolve(null),
);
if (!listingId.value) throw showError({ statusCode: 404, statusMessage: "Car not found." });
if (publicListingError.value) throw showError({
  statusCode: publicListingError.value.statusCode || 500,
  statusMessage: publicListingError.value.statusMessage || "Unable to load this listing.",
});
if (!publicListing.value?.car) throw showError({ statusCode: 404, statusMessage: "Car not found." });
const car = computed(() => publicListing.value!.car);

const formatPrice = (price: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: car.value.currency ?? "EUR", maximumFractionDigits: 0 }).format(price);
const formatMileage = (mileage: number) => new Intl.NumberFormat("en-GB").format(mileage);
const photos = computed(() => car.value.images?.length ? car.value.images.map((image) => image.url) : car.value.image ? [car.value.image] : []);
const photoPreviews = computed(() => car.value.images?.map((image) => image.thumbnailUrl || image.catalogUrl || image.url) ?? []);
const photoCatalog = computed(() => car.value.images?.map((image) => image.catalogUrl || image.url) ?? []);
const { items: favorites, toggle: toggleFavorite, loading: favoritesLoading, busyIds } = useFavorites();
const { user, isAuthReady } = useAuth();
const isSaved = computed(() => favorites.value.some((favorite) => favorite.id === car.value.id));
const actionMessage = ref("");
const contacting = ref(false);
const showFullDescription = ref(false);
const viewCount = ref<number | null>(null);
const viewError = ref("");
let countedId = "";
let viewRevision = 0;
onMounted(() => {
  watch([listingId, () => publicListing.value?.car?.id], ([id, loadedId]) => {
    if (id !== countedId) {
      viewRevision++;
      countedId = "";
      viewCount.value = null;
      viewError.value = "";
    }
    if (!id || id !== loadedId || id === countedId) return;
    countedId = id;
    const revision = viewRevision;
    viewCount.value = publicListing.value?.car.views ?? null;
    void $fetch<{ views: number }>(`/api/cars/${id}/view`, { method: "POST" })
      .then((result) => { if (listingId.value === id && viewRevision === revision) viewCount.value = result.views; })
      .catch((error: unknown) => {
        if (listingId.value === id && viewRevision === revision) viewError.value = getAuthErrorMessage(error, "Unable to update view count.");
      });
  }, { immediate: true });
});

const overviewItems = computed(() => [
  { label: "Year", value: String(car.value.year), icon: CalendarDays },
  { label: "Mileage", value: `${formatMileage(car.value.mileage)} km`, icon: Gauge },
  { label: "Fuel type", value: car.value.fuel, icon: Fuel },
  { label: "Transmission", value: car.value.transmission, icon: Cog },
  { label: "Engine", value: car.value.engine, icon: CarFront },
  { label: "Power", value: car.value.power === null ? "—" : `${car.value.power} hp`, icon: Zap },
  { label: "Body type", value: car.value.bodyType, icon: CarFront },
  { label: "Condition", value: car.value.condition || "", icon: Palette },
]);

const descriptionIsLong = computed(() => car.value.description.length > 150);
const visibleDescription = computed(() => {
  if (!descriptionIsLong.value || showFullDescription.value) {
    return car.value.description;
  }
  return `${car.value.description.slice(0, 150).trimEnd()}…`;
});

const { data: similarCatalog, error: similarError } = await useAsyncData(
  `similar-cars-${listingId.value}`,
  () => listingId.value
    ? requestFetch<{ items: Car[] }>("/api/cars", { query: { brand: car.value.make, limit: 5, sort: "recommended" } })
    : Promise.resolve({ items: [] as Car[] }),
  { default: () => ({ items: [] }) },
);
const similarCars = computed(() => similarCatalog.value.items.filter((item) => item.id !== car.value.id).slice(0, 4));

const toggleSaved = async () => {
  const wasSaved = isSaved.value;
  try {
    await toggleFavorite(car.value.id);
    actionMessage.value = wasSaved ? "Removed from your saved cars." : "Saved to your cars.";
  } catch (error) {
    actionMessage.value = getAuthErrorMessage(error, error instanceof Error ? error.message : "Unable to update saved cars.");
  }
};

async function shareListing() {
  const shareData = {
    title: `${car.value.make} ${car.value.model} ${car.value.year}`,
    text: `${car.value.make} ${car.value.model} — ${formatPrice(car.value.price)}`,
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      actionMessage.value = "Listing shared.";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareData.url);
      actionMessage.value = "Listing link copied to clipboard.";
    } else {
      actionMessage.value = "Sharing isn't available in this browser.";
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    actionMessage.value = "Unable to share this listing. Please try again.";
  }
}

const contactSeller = async () => {
  if (contacting.value || !car.value.seller || !listingId.value) return;
  if (!user.value) {
    await navigateTo({ path: "/login", query: { redirect: `/account/messages?carId=${listingId.value}` } });
    return;
  }
  contacting.value = true;
  actionMessage.value = "";
  try {
    const result = await $fetch<{ id: string }>("/api/conversations", { method: "POST", body: { carId: listingId.value } });
    await navigateTo({ path: "/account/messages", query: { conversation: result.id } });
  } catch (error) {
    actionMessage.value = getAuthErrorMessage(error, "Unable to contact the seller. Please try again.");
  } finally {
    contacting.value = false;
  }
};

const featureIcon = (feature: string): Component => {
  const normalized = feature.toLowerCase();
  if (normalized.includes("roof")) return Sun;
  if (normalized.includes("heated")) return Thermometer;
  if (normalized.includes("navigation") || normalized.includes("cockpit")) return Navigation;
  if (normalized.includes("parking") || normalized.includes("camera")) return Camera;
  if (normalized.includes("cruise")) return Gauge;
  if (normalized.includes("headlight")) return Lightbulb;
  return Check;
};

const seoTitle = () => `${car.value.make} ${car.value.model} ${car.value.year} — EuroCars`;
const seoDescription = () => car.value.description;
useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  twitterCard: "summary",
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
});
</script>

<template>
  <div class="bg-brand-background">
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" class="mb-5 overflow-x-auto">
        <ol class="flex min-w-max items-center gap-2 text-sm text-gray-500">
          <li><NuxtLink to="/" class="transition hover:text-blue-600">Home</NuxtLink></li>
          <li aria-hidden="true">/</li>
          <li><NuxtLink to="/cars" class="transition hover:text-blue-600">Cars</NuxtLink></li>
          <li aria-hidden="true">/</li>
          <li>
            <NuxtLink :to="{ path: '/cars', query: { brand: car.make } }" class="transition hover:text-blue-600">
              {{ car.make }}
            </NuxtLink>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" class="font-medium text-gray-800">{{ car.model }}</li>
        </ol>
      </nav>

      <header class="mb-6 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <h1 class="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{{ car.make }} {{ car.model }}</h1>
          <p class="mt-2 text-lg text-gray-600">{{ car.trim }}</p>
          <p v-if="car.title && car.title !== `${car.make} ${car.model}`" class="mt-1 text-sm text-slate-500">{{ car.title }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
            <span class="inline-flex items-center gap-1.5"><CalendarDays class="h-4 w-4" aria-hidden="true" />{{ car.year }}</span>
            <span class="inline-flex items-center gap-1.5"><MapPin class="h-4 w-4" aria-hidden="true" />{{ car.city }}, {{ car.country }}</span>
            <span v-if="listingId && viewCount !== null" class="inline-flex items-center gap-1.5"><Eye class="h-4 w-4" aria-hidden="true" />{{ new Intl.NumberFormat("en-GB").format(viewCount) }} views</span>
          </div>
          <p v-if="viewError" role="alert" class="mt-2 text-sm text-red-700">{{ viewError }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            :aria-pressed="isSaved"
            :disabled="favoritesLoading || busyIds.includes(car.id)"
            @click="toggleSaved">
            <Heart class="h-4 w-4" :class="isSaved ? 'fill-rose-500 text-rose-500' : ''" aria-hidden="true" />
            {{ isSaved ? "Saved" : "Save" }}
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            @click="shareListing">
            <Share2 class="h-4 w-4" aria-hidden="true" />
            Share
          </button>
        </div>
      </header>

      <div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div class="min-w-0 space-y-6">
          <CarPhotoGallery :photos="photos" :previews="photoPreviews" :catalog="photoCatalog" :car-name="`${car.make} ${car.model}`" />

          <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-7">
            <div class="mb-5 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">At a glance</p>
                <h2 class="mt-1 text-xl font-bold tracking-tight text-gray-950">Vehicle overview</h2>
              </div>
              <CarFront class="hidden h-6 w-6 text-blue-600 sm:block" aria-hidden="true" />
            </div>

            <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div v-for="item in overviewItems" :key="item.label" class="min-w-0 rounded-xl bg-slate-50 p-3.5 transition hover:bg-blue-50/70 sm:p-4">
                <dt class="flex items-center gap-2 text-xs font-medium text-gray-500 sm:text-sm">
                  <component :is="item.icon" class="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                  <span class="truncate">{{ item.label }}</span>
                </dt>
                <dd class="mt-2 break-words text-sm font-semibold capitalize text-gray-900 sm:text-base">{{ item.value || "—" }}</dd>
              </div>
            </dl>
          </section>

          <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-7">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">The details</p>
            <h2 class="mt-1 text-xl font-bold tracking-tight text-gray-950">Vehicle description</h2>
            <p class="mt-4 whitespace-pre-line text-sm leading-7 text-gray-600 sm:text-base">{{ visibleDescription }}</p>
            <button
              v-if="descriptionIsLong"
              type="button"
              class="mt-3 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
              @click="showFullDescription = !showFullDescription">
              {{ showFullDescription ? "Show less" : "Read more" }}
            </button>
          </section>

          <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-7">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Included with this car</p>
                <h2 class="mt-1 text-xl font-bold tracking-tight text-gray-950">Features & equipment</h2>
              </div>
              <Check class="h-6 w-6 text-blue-600" aria-hidden="true" />
            </div>

            <div v-if="car.featureGroups?.length" class="mt-5 space-y-6">
              <div v-for="group in car.featureGroups" :key="group.name"><h3 class="text-sm font-bold text-brand-navy">{{ group.name }}</h3>
                <ul class="mt-3 grid gap-3 sm:grid-cols-2"><li v-for="feature in group.items" :key="feature" class="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 px-3.5 py-3 text-sm font-medium text-gray-700"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><component :is="featureIcon(feature)" class="h-4 w-4" aria-hidden="true" /></span><span>{{ feature }}</span></li></ul>
              </div>
            </div>
            <p v-else class="mt-4 text-sm text-slate-500">No equipment details provided.</p>
          </section>
        </div>

        <aside class="min-w-0 space-y-4 lg:sticky lg:top-32 lg:self-start">
          <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-lg shadow-gray-900/[0.04] sm:p-6">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Asking price</p>
                <p class="mt-1 text-3xl font-bold tracking-tight text-gray-950">{{ formatPrice(car.price) }}</p>
              </div>
              <button
                type="button"
                class="inline-flex h-10 w-10 shrink-0 items-center cursor-pointer justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-rose-200 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                :aria-label="isSaved ? 'Remove from saved cars' : 'Save this car'"
                :aria-pressed="isSaved"
                :disabled="favoritesLoading || busyIds.includes(car.id)"
                @click="toggleSaved">
                <Heart class="h-5 w-5" :class="isSaved ? 'fill-rose-500 text-rose-500' : ''" aria-hidden="true" />
              </button>
            </div>

            <h2 class="mt-5 text-lg font-bold text-gray-950">{{ car.make }} {{ car.model }}</h2>
            <p class="mt-1 text-sm text-gray-500">{{ car.trim }}</p>
            <div class="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-gray-600">
              <MapPin class="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <span><span class="block text-xs text-gray-500">Vehicle location</span>{{ car.city }}, {{ car.country }}</span>
            </div>

            <button
              type="button"
              class="mt-5 inline-flex cursor-pointer min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!isAuthReady || !car.seller || contacting || user?.id === car.seller?.id"
              @click="contactSeller">
              {{ contacting ? "Opening conversation..." : user?.id === car.seller?.id ? "Your listing" : "Contact seller" }}
            </button>
            <p v-if="actionMessage" role="status" class="mt-3 rounded-xl bg-blue-50 px-3.5 py-3 text-sm leading-5 text-blue-800">
              {{ actionMessage }}
            </p>
          </section>

          <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div class="flex items-center gap-3">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-gray-500">
                <SafeImage v-if="car.seller?.avatarUrl" :src="car.seller.avatarUrl" alt="" width="256" height="256" class="h-full w-full rounded-full object-cover" />
                <UserRound v-else class="h-5 w-5" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h2 class="font-bold text-gray-950">Seller information</h2>
                <p class="break-words text-sm text-gray-600">{{ car.dealer?.name ?? car.seller?.name ?? "Seller details unavailable" }}</p>
                <p v-if="car.dealer" class="mt-1 text-xs font-semibold text-slate-500">{{ car.dealer.isVerified ? "Verified Dealer" : "Dealer" }}</p>
                <p v-else-if="car.seller" class="mt-1 text-xs font-semibold text-slate-500">Private Seller</p>
              </div>
            </div>

            <p class="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <MapPin class="h-4 w-4 text-blue-600" aria-hidden="true" />
              Vehicle located in {{ car.city }}, {{ car.country }}
            </p>
            <button
              type="button"
              class="mt-4 inline-flex cursor-pointer min-h-10 w-full items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!isAuthReady || !car.seller || contacting || user?.id === car.seller?.id"
              @click="contactSeller">
              {{ contacting ? "Opening conversation..." : user?.id === car.seller?.id ? "Your listing" : "Contact seller" }}
            </button>
          </section>
        </aside>
      </div>

      <p v-if="similarError" role="alert" class="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">Unable to load similar cars.</p>
      <section v-else-if="similarCars.length" class="mt-12 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-12">
        <div class="mb-6 flex items-end justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">You may also like</p>
            <h2 class="mt-1 text-2xl font-bold tracking-tight text-gray-950">Similar cars</h2>
          </div>
          <NuxtLink to="/cars" class="shrink-0 text-sm font-semibold text-blue-600 transition hover:text-blue-700">
            Browse all cars <span aria-hidden="true">→</span>
          </NuxtLink>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <CarCard v-for="similarCar in similarCars" :key="similarCar.id" :car="similarCar" />
        </div>
      </section>
    </div>
  </div>
</template>
