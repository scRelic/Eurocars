<script setup lang="ts">
import { Archive, CarFront, Eye, Search } from "@lucide/vue";
import type { AdminCar, AdminPageResult } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Car Listings — EuroCars Admin" });

const requestFetch = useRequestFetch();
const searchInput = ref("");
const search = ref("");
const statusFilter = ref("");
const countryFilter = ref("");
const sort = ref("newest");
const page = ref(1);
const actionError = ref("");
const busyId = ref("");
const archiveCar = ref<AdminCar | null>(null);
const toastMessage = ref("");
const { data: countries } = await useAsyncData("admin-country-options", () => requestFetch<{ items: { code: string; name: string }[] }>("/api/countries"));
const statusOptions = [
  { label: "All statuses", value: "" },
  ...["DRAFT", "PENDING", "ACTIVE", "SOLD", "REJECTED", "ARCHIVED"].map((value) => ({ label: value, value })),
];
const countryOptions = computed(() => [
  { label: "All countries", value: "" },
  ...(countries.value?.items ?? []).map((country) => ({ label: country.name, value: country.code })),
]);
const sortOptions = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Price: low to high", value: "price-asc" },
  { label: "Price: high to low", value: "price-desc" },
  { label: "Newest model year", value: "year-desc" },
];
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    search.value = value.trim();
    page.value = 1;
  }, 250);
});
watch([statusFilter, countryFilter, sort], () => { page.value = 1; });
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer); });
const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), limit: "20", sort: sort.value });
  if (search.value) params.set("search", search.value);
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (countryFilter.value) params.set("country", countryFilter.value);
  return params.toString();
});
const { data, error, status: loadStatus, refresh } = await useAsyncData(
  "admin-cars", () => requestFetch<AdminPageResult<AdminCar>>(`/api/admin/cars?${query.value}`), { watch: [query] },
);
const money = (price: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(price);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const archive = async (car: AdminCar) => {
  if (busyId.value) return;
  actionError.value = "";
  busyId.value = car.id;
  try {
    await $fetch(`/api/admin/cars/${car.id}/status`, { method: "PATCH", body: { status: "ARCHIVED" } });
    await refresh();
    archiveCar.value = null;
    toastMessage.value = "Listing archived.";
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to archive this listing.");
  } finally {
    busyId.value = "";
  }
};
</script>

<template>
  <div>
    <AppToast :message="toastMessage" @close="toastMessage = ''" />
    <ConfirmModal v-if="archiveCar" title="Archive listing?" :subject="archiveCar.title" description="This listing will no longer be publicly visible." confirm-label="Archive listing" :busy="busyId !== ''" :error="actionError" @close="archiveCar = null; actionError = ''" @confirm="archive(archiveCar)" />
    <AdminPageHeading eyebrow="Marketplace inventory" title="Car Listings" description="Search and review every listing stored in the marketplace." />
    <p v-if="actionError" role="alert" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <section class="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_190px_160px]">
        <label class="relative block sm:col-span-2 xl:col-span-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input v-model="searchInput" type="search" aria-label="Search listings" class="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Search title, make, seller">
        </label>
        <AppSelect v-model="statusFilter" :options="statusOptions" label="Listing status" placeholder="All statuses" />
        <AppSelect v-model="countryFilter" :options="countryOptions" label="Country" placeholder="All countries" />
        <AppSelect v-model="sort" :options="sortOptions" label="Sort listings" placeholder="Newest first" />
      </div>
      <div v-if="error" role="alert" class="p-8 text-center text-sm text-red-700">
        Could not load car listings.
        <button type="button" class="ml-1 cursor-pointer font-semibold underline" @click="refresh()">Retry</button>
      </div>
      <div v-else-if="loadStatus === 'pending'" role="status" class="p-8 text-center text-sm text-slate-500">Loading listings...</div>
      <div v-else-if="data?.items.length" class="overflow-x-auto">
        <table class="w-full min-w-[1000px] text-left text-sm">
          <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr><th class="px-5 py-3">Vehicle</th><th class="px-4 py-3">Seller</th><th class="px-4 py-3">Location</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Price</th><th class="px-4 py-3">Created</th><th class="px-5 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="car in data.items" :key="car.id" class="transition hover:bg-slate-50/70">
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <SafeImage v-if="car.imageUrl" :src="car.imageUrl" :alt="car.title" width="320" height="240" class="h-12 w-16 rounded-lg bg-slate-100 object-cover" />
                  <span v-else class="flex h-12 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
                  <div class="min-w-0"><p class="max-w-64 truncate font-semibold text-slate-900">{{ car.title }}</p><p class="mt-1 text-xs text-slate-500">{{ car.brand }} {{ car.model }} · {{ car.year }} · {{ new Intl.NumberFormat("en-GB").format(car.mileage) }} km</p></div>
                </div>
              </td>
              <td class="px-4 py-4"><NuxtLink :to="`/admin/users/${car.sellerId}`" class="font-medium text-blue-700 hover:underline">{{ car.sellerName }}</NuxtLink><p class="mt-1 text-xs text-slate-500">{{ car.sellerEmail }}</p></td>
              <td class="px-4 py-4 text-slate-600">{{ car.city }}, {{ car.country }}</td>
              <td class="px-4 py-4"><AdminStatusBadge :status="car.status" /></td>
              <td class="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">{{ money(car.price, car.currency) }}</td>
              <td class="whitespace-nowrap px-4 py-4 text-slate-600"><time :datetime="car.createdAt">{{ date(car.createdAt) }}</time></td>
              <td class="px-5 py-4"><div class="flex justify-end gap-2">
                <NuxtLink :to="`/admin/cars/${car.id}`" :aria-label="`View ${car.title}`" class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:text-blue-700"><Eye class="h-4 w-4" aria-hidden="true" /></NuxtLink>
                <button v-if="car.status !== 'ARCHIVED'" type="button" :aria-label="`Archive ${car.title}`" class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-red-200 hover:text-red-700 disabled:opacity-40" :disabled="busyId !== ''" @click="actionError = ''; archiveCar = car"><Archive class="h-4 w-4" aria-hidden="true" /></button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="px-5 py-16 text-center">
        <CarFront class="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
        <h2 class="mt-3 font-semibold text-slate-800">No listings found</h2>
        <p class="mt-1 text-sm text-slate-500">Try changing your search or filters.</p>
      </div>
      <AdminPagination v-if="data" :page="data.page" :total-pages="data.totalPages" :total="data.total" :limit="data.limit" @page="page = $event" />
    </section>
  </div>
</template>
