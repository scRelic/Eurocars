<script setup lang="ts">
import { ChevronLeft, ChevronRight, LayoutGrid, List, SlidersHorizontal, X } from "@lucide/vue";
import type { LocationQueryRaw } from "vue-router";
import type { Country, LookupItem } from "~/../shared/types/listing";
import type { Car, CarFilters } from "~/data/cars";

type SortOption = "recommended" | "price-asc" | "price-desc" | "year-desc" | "mileage-asc";
type CatalogResponse = { items: Car[]; page: number; limit: number; total: number; totalPages: number };
type CatalogLookups = { brands: LookupItem[]; countries: Country[] };

const route = useRoute();
const requestFetch = useRequestFetch();
const queryValue = (key: string) => typeof route.query[key] === "string" ? route.query[key] : "";
const numberValue = (key: string) => {
  const raw = queryValue(key);
  const value = Number(raw);
  return raw && Number.isFinite(value) && value >= 0 ? value : null;
};
const readFilters = (): CarFilters => ({
  brand: queryValue("brand"), model: queryValue("model"), country: queryValue("country"),
  minPrice: numberValue("minPrice"), maxPrice: numberValue("maxPrice"),
});
const filters = ref<CarFilters>(readFilters());
const filtersOpen = ref(false);
const view = ref<"grid" | "list">("grid");
const resultsElement = ref<HTMLElement | null>(null);
const itemsPerPage = 12;
const sortOptions: { label: string; value: SortOption }[] = [
  { label: "Recommended", value: "recommended" },
  { label: "Price: low to high", value: "price-asc" },
  { label: "Price: high to low", value: "price-desc" },
  { label: "Newest first", value: "year-desc" },
  { label: "Lowest mileage", value: "mileage-asc" },
];
const sortBy = computed<SortOption>(() => sortOptions.find((item) => item.value === queryValue("sort"))?.value ?? "recommended");
const currentPage = computed(() => {
  const page = Number(queryValue("page"));
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1;
});
const searchTerm = computed(() => queryValue("search"));

watch(() => route.fullPath, () => {
  filters.value = readFilters();
});

const { data: lookups, error: lookupsError, refresh: refreshLookups } = await useAsyncData(
  "public-car-catalog-lookups",
  async () => {
    const [brands, countries] = await Promise.all([
      requestFetch<{ items: LookupItem[] }>("/api/brands"),
      requestFetch<{ items: Country[] }>("/api/countries"),
    ]);
    return { brands: brands.items, countries: countries.items } satisfies CatalogLookups;
  },
);
const catalogQuery = computed(() => ({
  brand: queryValue("brand") || undefined,
  model: queryValue("model") || undefined,
  country: queryValue("country") || undefined,
  minPrice: queryValue("minPrice") || undefined,
  maxPrice: queryValue("maxPrice") || undefined,
  search: searchTerm.value || undefined,
  sort: sortBy.value,
  page: currentPage.value,
  limit: itemsPerPage,
}));
const { data: catalog, error: catalogError, status: catalogStatus, refresh: refreshCatalog } = await useAsyncData(
  "public-car-catalog",
  () => requestFetch<CatalogResponse>("/api/cars", { query: catalogQuery.value }),
  { watch: [catalogQuery] },
);
const cars = computed(() => catalog.value?.items ?? []);
const totalPages = computed(() => catalog.value?.totalPages ?? 0);
const pageNumbers = computed(() => {
  const pages = [...new Set([1, currentPage.value - 1, currentPage.value, currentPage.value + 1, totalPages.value])]
    .filter((page) => page >= 1 && page <= totalPages.value).sort((a, b) => a - b);
  const result: (number | string)[] = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1]! > 1) result.push(`gap-${page}`);
    result.push(page);
  });
  return result;
});
const activeFilters = computed(() => [
  { key: "brand", label: queryValue("brand") },
  { key: "model", label: queryValue("model") },
  { key: "country", label: queryValue("country") },
  { key: "minPrice", label: queryValue("minPrice") ? `From €${queryValue("minPrice")}` : "" },
  { key: "maxPrice", label: queryValue("maxPrice") ? `Up to €${queryValue("maxPrice")}` : "" },
  { key: "search", label: searchTerm.value ? `Search: ${searchTerm.value}` : "" },
].filter((item) => item.label));

async function applyFilters() {
  const query: LocationQueryRaw = { ...route.query };
  for (const [key, value] of Object.entries(filters.value)) {
    if (value === "" || value === null) query[key] = undefined;
    else query[key] = String(value);
  }
  delete query.page;
  filtersOpen.value = false;
  await navigateTo({ path: "/cars", query });
}

async function removeFilter(key: string) {
  const query: LocationQueryRaw = { ...route.query };
  query[key] = undefined;
  if (key === "brand") delete query.model;
  delete query.page;
  await navigateTo({ path: "/cars", query });
}

async function changeSort(sort: SortOption) {
  const query: LocationQueryRaw = { ...route.query };
  if (sort === "recommended") delete query.sort;
  else query.sort = sort;
  delete query.page;
  await navigateTo({ path: "/cars", query });
}

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  await navigateTo({ path: "/cars", query: { ...route.query, page: page === 1 ? undefined : String(page) } });
  await nextTick();
  resultsElement.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function clearFilters() {
  filtersOpen.value = false;
  await navigateTo("/cars");
  filters.value = readFilters();
}

const seoTitle = "Car listings — EuroCars";
const seoDescription = "Explore car listings and compare offers from across Europe.";
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
    <div class="border-b border-brand-border bg-white">
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-11">
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">The EuroCars marketplace</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">Cars across Europe</h1>
        <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Find the right car by brand, model, price and country.</p>
      </div>
    </div>
    <div class="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <button type="button" class="mb-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-border bg-white text-sm font-bold text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-blue lg:hidden" :aria-expanded="filtersOpen" aria-controls="catalog-filters" @click="filtersOpen = !filtersOpen"><SlidersHorizontal class="h-4 w-4" aria-hidden="true" />{{ filtersOpen ? "Hide filters" : "Filters" }}<span v-if="activeFilters.length" class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-brand-blue">{{ activeFilters.length }}</span></button>
      <div class="grid min-w-0 gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside id="catalog-filters" class="min-w-0 lg:block" :class="filtersOpen ? 'block' : 'hidden'">
          <div class="rounded-2xl border border-brand-border bg-white p-5 shadow-sm lg:sticky lg:top-32">
            <div class="mb-5 flex items-center justify-between gap-3"><h2 class="text-lg font-bold text-brand-navy">Filters</h2><button type="button" class="cursor-pointer text-xs font-semibold text-brand-blue hover:underline" @click="clearFilters">Clear all</button></div>
            <p v-if="lookupsError" role="alert" class="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Unable to load search filters. <button type="button" class="cursor-pointer font-semibold underline" @click="refreshLookups()">Try again</button></p>
            <CarSearchForm v-model:filters="filters" :brands="lookups?.brands ?? []" :countries="lookups?.countries ?? []" sidebar @search="applyFilters" />
          </div>
        </aside>
        <section ref="resultsElement" class="min-w-0 scroll-mt-32" aria-label="Search results">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div><p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">Explore listings</p><h2 class="mt-2 text-xl font-bold text-brand-navy">Search results</h2><p v-if="catalog && catalogStatus !== 'pending'" class="mt-1 text-sm text-slate-600">{{ new Intl.NumberFormat("en-GB").format(catalog.total) }} {{ catalog.total === 1 ? "car" : "cars" }} found</p></div>
            <div class="flex flex-wrap items-center gap-2"><div class="w-48 sm:w-52"><AppSelect :model-value="sortBy" :options="sortOptions" placeholder="Recommended" label="Sort by" @update:model-value="changeSort" /></div><div class="flex rounded-xl border border-brand-border bg-white p-1" role="group" aria-label="Results view"><button type="button" aria-label="Grid view" :aria-pressed="view === 'grid'" class="cursor-pointer rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-brand-blue" :class="view === 'grid' ? 'bg-blue-50 text-brand-blue' : 'text-slate-500'" @click="view = 'grid'"><LayoutGrid class="h-5 w-5" aria-hidden="true" /></button><button type="button" aria-label="List view" :aria-pressed="view === 'list'" class="cursor-pointer rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-brand-blue" :class="view === 'list' ? 'bg-blue-50 text-brand-blue' : 'text-slate-500'" @click="view = 'list'"><List class="h-5 w-5" aria-hidden="true" /></button></div></div>
          </div>
          <div v-if="activeFilters.length" class="mt-5 flex flex-wrap items-center gap-2" aria-label="Active filters"><button v-for="item in activeFilters" :key="item.key" type="button" class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-brand-blue" :aria-label="`Remove ${item.label} filter`" @click="removeFilter(item.key)">{{ item.label }} <X class="h-3.5 w-3.5" aria-hidden="true" /></button><button type="button" class="cursor-pointer px-2 py-1 text-xs font-semibold text-slate-500 hover:text-brand-blue" @click="clearFilters">Clear all</button></div>
          <p v-if="catalogError" role="alert" class="mt-6 rounded-xl bg-red-50 p-5 text-sm text-red-700">{{ getAuthErrorMessage(catalogError, "Unable to load cars from the marketplace.") }} <button type="button" class="ml-2 cursor-pointer font-semibold underline" @click="refreshCatalog()">Try again</button></p>
          <div v-else-if="catalogStatus === 'pending'" role="status" class="mt-6 grid gap-5 sm:grid-cols-2"><span class="sr-only">Loading cars...</span><div v-for="n in 4" :key="n" class="h-80 animate-pulse rounded-2xl bg-slate-200" /></div>
          <template v-else-if="cars.length">
            <div class="mt-6 grid gap-5" :class="view === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'"><CarCard v-for="car in cars" :key="car.id" :car="car" :layout="view" /></div>
            <nav v-if="totalPages > 1" aria-label="Pagination" class="mt-8 flex flex-wrap items-center justify-center gap-1.5">
              <button type="button" aria-label="Previous page" :disabled="currentPage === 1" class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-brand-border bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" @click="goToPage(currentPage - 1)"><ChevronLeft class="h-4 w-4" aria-hidden="true" /></button>
              <template v-for="page in pageNumbers" :key="page"><span v-if="typeof page === 'string'" class="px-1 text-slate-400">…</span><button v-else type="button" class="h-10 min-w-10 cursor-pointer rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-blue" :class="page === currentPage ? 'bg-brand-blue text-white' : 'border border-brand-border bg-white text-slate-700 hover:text-brand-blue'" :aria-label="`Page ${page}`" :aria-current="page === currentPage ? 'page' : undefined" @click="goToPage(page)">{{ page }}</button></template>
              <button type="button" aria-label="Next page" :disabled="currentPage === totalPages" class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-brand-border bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" @click="goToPage(currentPage + 1)"><ChevronRight class="h-4 w-4" aria-hidden="true" /></button>
            </nav>
          </template>
          <div v-else class="mt-6 rounded-2xl border border-dashed border-brand-border bg-white px-6 py-16 text-center"><h2 class="text-xl font-bold text-brand-navy">No cars found</h2><p class="mt-2 text-sm text-slate-600">Try adjusting your search filters to see more listings.</p><button type="button" class="mt-5 cursor-pointer rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white hover:bg-brand-blue-hover" @click="clearFilters">Clear filters</button></div>
        </section>
      </div>
    </div>
  </div>
</template>
