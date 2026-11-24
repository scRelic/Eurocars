<script setup lang="ts">
import { ArrowRight, CarFront, Globe2, MessageSquare, Search, SlidersHorizontal } from "@lucide/vue";
import type { Country, LookupItem } from "~/../shared/types/listing";
import type { Car, CarFilters } from "~/data/cars";

const filters = ref<CarFilters>({
  brand: "",
  model: "",
  country: "",
  minPrice: null,
  maxPrice: null,
});

type HomeLookups = { brands: LookupItem[]; countries: Country[] };
type FeaturedCars = { items: Car[]; total: number };
const requestFetch = useRequestFetch();
const { data: lookups, error: lookupsError } = await useAsyncData("home-car-search-options", async () => {
  const [brands, countries] = await Promise.all([
    requestFetch<{ items: LookupItem[] }>("/api/brands"),
    requestFetch<{ items: Country[] }>("/api/countries"),
  ]);
  return { brands: brands.items, countries: countries.items } satisfies HomeLookups;
});
const { data: featured, error: featuredError, status: featuredStatus } = await useAsyncData(
  "home-featured-cars",
  () => requestFetch<FeaturedCars>("/api/cars", { query: { limit: 9, sort: "recommended" } }),
);
const featuredCars = computed(() => featured.value?.items ?? []);
const heroCar = computed(() => featuredCars.value.find((car) => car.image));
const popularBrandNames = ["BMW", "Mercedes-Benz", "Audi", "Volkswagen", "Porsche", "Toyota", "Skoda", "Volvo"];
const brandLogos: Record<string, string> = {
  BMW: "/brands/bmw.svg",
  "Mercedes-Benz": "/brands/mercedes-benz.svg",
  Audi: "/brands/audi.svg",
  Volkswagen: "/brands/volkswagen.svg",
  Porsche: "/brands/porsche.svg",
  Toyota: "/brands/toyota.svg",
  Skoda: "/brands/skoda.svg",
  Volvo: "/brands/volvo.svg",
};
const failedBrandLogos = ref<Set<string>>(new Set());
const brandSection = ref<HTMLElement | null>(null);
onMounted(() => {
  for (const image of brandSection.value?.querySelectorAll<HTMLImageElement>("img[data-brand-id]") ?? []) {
    if (image.complete && !image.naturalWidth && image.dataset.brandId) failedBrandLogos.value.add(image.dataset.brandId);
  }
});
const popularBrands = computed(() => popularBrandNames.flatMap((name) => {
  const brand = lookups.value?.brands.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return brand ? [{ ...brand, logo: brandLogos[name] }] : [];
}));

const searchCars = () => {
  const query = Object.fromEntries(
    Object.entries(filters.value)
      .filter(([, value]) => value !== "" && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
  return navigateTo({ path: "/cars", query });
};

const seoTitle = "EuroCars — Cars from across Europe";
const seoDescription = "Discover cars from sellers across Europe and find your next car on EuroCars.";
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
  <div>
    <section class="relative overflow-hidden bg-brand-navy text-white">
      <SafeImage v-if="heroCar?.image" :src="heroCar.image" alt="" width="1920" height="1080" loading="eager" class="absolute inset-0 h-full w-full object-cover object-center opacity-45" fetchpriority="high" />
      <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-r from-brand-navy via-brand-navy/90 to-brand-navy/45" />
      <div aria-hidden="true" class="absolute -right-16 top-6 hidden h-80 w-80 rounded-full border border-white/10 bg-blue-500/10 blur-2xl lg:block" />
      <div class="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
        <p class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100"><Globe2 class="h-4 w-4" aria-hidden="true" />The European car marketplace</p>
        <h1 class="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">Find Your Next Car in Europe</h1>
        <p class="mt-5 max-w-xl text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">Discover cars from sellers and dealerships across Europe, all in one place.</p>
        <div class="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-200">
          <span v-if="featured" class="inline-flex items-center gap-2"><CarFront class="h-4 w-4 text-blue-300" aria-hidden="true" /><strong class="text-white">{{ new Intl.NumberFormat("en-GB").format(featured.total) }}</strong> cars for sale</span>
          <span v-if="lookups" class="inline-flex items-center gap-2"><Globe2 class="h-4 w-4 text-blue-300" aria-hidden="true" /><strong class="text-white">{{ new Intl.NumberFormat("en-GB").format(lookups.countries.length) }}</strong> countries available</span>
        </div>
      </div>
    </section>
    <div class="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6">
      <div class="rounded-2xl border border-brand-border bg-white p-5 shadow-xl shadow-brand-navy/10 sm:p-6">
        <div class="mb-5 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-blue"><Search class="h-5 w-5" aria-hidden="true" /></span><div><h2 class="font-bold text-brand-navy">Find your perfect match</h2><p class="mt-0.5 text-sm text-slate-500">Search the latest listings across Europe.</p></div></div>
        <p v-if="lookupsError" role="alert" class="mb-4 text-sm text-red-700">Search filters are currently unavailable.</p>
        <CarSearchForm v-model:filters="filters" :brands="lookups?.brands ?? []" :countries="lookups?.countries ?? []" @search="searchCars" />
      </div>
    </div>

    <section v-if="popularBrands.length" ref="brandSection" class="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20">
      <div class="mb-6 flex items-end justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">Explore the marketplace</p><h2 class="mt-2 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">Browse by brand</h2></div><NuxtLink to="/cars" class="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:text-brand-blue-hover">All cars <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink></div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <NuxtLink v-for="brand in popularBrands" :key="brand.id" :to="{ path: '/cars', query: { brand: brand.name } }" class="group flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-brand-border bg-white p-3 text-center transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-brand-navy/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
          <span class="flex h-14 w-full items-center justify-center">
            <img v-if="brand.logo && !failedBrandLogos.has(brand.id)" :src="brand.logo" :data-brand-id="brand.id" alt="" class="h-full w-full max-w-24 object-contain" loading="lazy" @error="failedBrandLogos.add(brand.id)">
            <span v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{{ brand.name.slice(0, 1) }}</span>
          </span>
          <span class="text-sm font-semibold text-brand-navy">{{ brand.name }}</span>
        </NuxtLink>
      </div>
    </section>
    <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <div class="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">Fresh from the marketplace</p><h2 class="mt-2 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">Latest Listings</h2><p class="mt-2 text-sm text-slate-600">Explore recently added cars from across Europe.</p></div><NuxtLink to="/cars" class="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:text-brand-blue-hover">View all listings <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink></div>
      <p v-if="featuredError" role="alert" class="rounded-xl bg-red-50 p-4 text-sm text-red-700">Unable to load listings from the marketplace.</p>
      <div v-else-if="featuredStatus === 'pending'" role="status" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><span class="sr-only">Loading cars...</span><div v-for="n in 3" :key="n" class="h-80 animate-pulse rounded-2xl bg-slate-200" /></div>
      <div v-else-if="featuredCars.length" class="grid gap-5 md:grid-cols-2 lg:grid-cols-3"><CarCard v-for="car in featuredCars" :key="car.id" :car="car" /></div>
      <p v-else class="rounded-xl border border-dashed border-brand-border bg-white p-8 text-center text-sm text-slate-600">No active listings are available yet.</p>
    </section>
    <section class="bg-white py-16 sm:py-20">
      <div class="mx-auto max-w-7xl px-4 sm:px-6"><p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">A simpler way to find your car</p><h2 class="mt-2 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">Why EuroCars?</h2>
        <div class="mt-8 grid gap-4 sm:grid-cols-3">
          <article v-for="item in [{ title: 'Explore Cars Across Europe', text: 'Discover listings from different countries in one place.', icon: Globe2 }, { title: 'Compare Listings Easily', text: 'Browse specifications, prices and locations at a glance.', icon: SlidersHorizontal }, { title: 'Connect With Sellers', text: 'Start a conversation directly about a car that interests you.', icon: MessageSquare }]" :key="item.title" class="rounded-2xl border border-brand-border bg-brand-background p-6"><component :is="item.icon" class="h-6 w-6 text-brand-blue" aria-hidden="true" /><h3 class="mt-5 font-bold text-brand-navy">{{ item.title }}</h3><p class="mt-2 text-sm leading-6 text-slate-600">{{ item.text }}</p></article>
        </div>
      </div>
    </section>
    <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6"><div class="flex flex-col gap-6 rounded-2xl bg-brand-navy p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-10"><div><p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">For sellers</p><h2 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Ready to Sell Your Car?</h2><p class="mt-2 text-sm leading-6 text-slate-300">Create a listing and connect with interested buyers.</p></div><NuxtLink to="/sell" class="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-blue px-6 text-sm font-bold text-white transition hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Create a Listing <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink></div></section>
  </div>
</template>
