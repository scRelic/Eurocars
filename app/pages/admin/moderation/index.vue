<script setup lang="ts">
import { CarFront, Check, Clock3, Eye, ShieldCheck, X } from "@lucide/vue";
import type { AdminCar, AdminPageResult, AdminSaleConfirmation } from "~/../shared/types/admin";
import { syncListingPhotos } from "~/composables/syncListingPhotos";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Moderation — EuroCars Admin" });

const requestFetch = useRequestFetch();
const page = ref(1);
const query = computed(() => new URLSearchParams({ page: String(page.value), limit: "10", status: "PENDING", sort: "oldest" }).toString());
const { data, error, refresh } = await useAsyncData(
  "admin-moderation", () => requestFetch<AdminPageResult<AdminCar>>(`/api/admin/cars?${query.value}`), { watch: [page] },
);
const salePage = ref(1);
const saleQuery = computed(() => new URLSearchParams({ page: String(salePage.value), limit: "10" }).toString());
const { data: sales, error: salesError, refresh: refreshSales } = await useAsyncData(
  "admin-sale-confirmations",
  () => requestFetch<AdminPageResult<AdminSaleConfirmation>>(`/api/admin/moderation/sales?${saleQuery.value}`),
  { watch: [salePage] },
);
const rejectId = ref("");
const rejectionReason = ref("");
const rejectSaleId = ref("");
const saleRejectionReason = ref("");
const actionError = ref("");
const busyId = ref("");
const approve = async (car: AdminCar) => {
  actionError.value = "";
  busyId.value = car.id;
  let updated = false;
  try {
    const result = await $fetch<{ listing: AdminCar }>(`/api/admin/cars/${car.id}/status`, { method: "PATCH", body: { status: "ACTIVE" } });
    updated = true;
    await refresh();
    const config = await $fetch<{ listingBlobEnabled: boolean }>("/api/uploads/config");
    if (config.listingBlobEnabled && await syncListingPhotos(result.listing.id, result.listing.images ?? [])) {
      actionError.value = "The listing was approved, but some photos are awaiting synchronization.";
    }
  } catch (error) {
    actionError.value = updated
      ? "The listing was approved, but the page or photo synchronization could not be refreshed."
      : getAuthErrorMessage(error, "Unable to approve this listing.");
  } finally {
    busyId.value = "";
  }
};
const reject = async (car: AdminCar) => {
  if (!rejectionReason.value.trim()) return;
  actionError.value = "";
  busyId.value = car.id;
  try {
    await $fetch(`/api/admin/cars/${car.id}/status`, {
      method: "PATCH",
      body: { status: "REJECTED", reason: rejectionReason.value.trim() },
    });
    rejectId.value = "";
    rejectionReason.value = "";
    await refresh();
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to reject this listing.");
  } finally {
    busyId.value = "";
  }
};
const confirmSale = async (car: AdminSaleConfirmation) => {
  actionError.value = "";
  busyId.value = car.id;
  try {
    await $fetch(`/api/admin/moderation/sales/${car.id}`, { method: "PATCH", body: { decision: "CONFIRM" } });
    await refreshSales();
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to confirm this sale.");
  } finally {
    busyId.value = "";
  }
};
const rejectSale = async (car: AdminSaleConfirmation) => {
  if (!saleRejectionReason.value.trim()) return;
  actionError.value = "";
  busyId.value = car.id;
  let updated = false;
  try {
    const result = await $fetch<{ listing: AdminCar }>(`/api/admin/moderation/sales/${car.id}`, {
      method: "PATCH",
      body: { decision: "REJECT", reason: saleRejectionReason.value.trim() },
    });
    updated = true;
    rejectSaleId.value = "";
    saleRejectionReason.value = "";
    await refreshSales();
    const config = await $fetch<{ listingBlobEnabled: boolean }>("/api/uploads/config");
    if (config.listingBlobEnabled && await syncListingPhotos(result.listing.id, result.listing.images ?? [])) {
      actionError.value = "The sale was rejected, but some photos are awaiting synchronization.";
    }
  } catch (error) {
    actionError.value = updated
      ? "The sale was rejected, but the page or photo synchronization could not be refreshed."
      : getAuthErrorMessage(error, "Unable to reject this sale confirmation.");
  } finally {
    busyId.value = "";
  }
};
const money = (price: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(price);
const submittedDate = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
</script>

<template>
  <div>
    <AdminPageHeading eyebrow="Trust & quality" title="Moderation" description="Review pending listings before they appear in the public marketplace.">
      <div class="flex flex-wrap gap-2 self-start sm:self-auto">
        <span class="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"><Clock3 class="h-4 w-4" aria-hidden="true" />{{ data?.total ?? 0 }} listings</span>
        <span class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><CarFront class="h-4 w-4" aria-hidden="true" />{{ sales?.total ?? 0 }} sales</span>
      </div>
    </AdminPageHeading>
    <p v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">Unable to load pending listings. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
    <p v-if="salesError" role="alert" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Unable to load sale confirmations. <button type="button" class="cursor-pointer font-semibold underline" @click="refreshSales()">Retry</button></p>
    <p v-if="actionError" role="alert" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <p v-if="!error && !data" role="status" class="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500">Loading moderation queue...</p>
    <section class="mt-7">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-950">Sales awaiting confirmation</h2>
          <p class="mt-1 text-sm text-slate-500">Review seller-reported sales. Rejected reports return the listing to Active.</p>
        </div>
        <span class="text-xs font-semibold text-slate-500">{{ sales?.total ?? 0 }} awaiting review</span>
      </div>
      <p v-if="!salesError && !sales" role="status" class="rounded-xl bg-white p-5 text-sm text-slate-500">Loading sale confirmations...</p>
      <div v-else-if="sales?.items.length" class="space-y-4">
        <article v-for="car in sales.items" :key="car.id" class="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div class="grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <SafeImage v-if="car.imageUrl" :src="car.imageUrl" :alt="`${car.title} photo`" width="320" height="240" class="h-44 w-full bg-slate-100 object-cover lg:h-full" />
            <div v-else class="flex h-44 items-center justify-center bg-slate-100 text-slate-400 lg:h-full"><CarFront class="h-8 w-8" aria-hidden="true" /></div>
            <div class="min-w-0 p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div><p class="text-xs font-bold uppercase tracking-wide text-blue-700">Seller reported sold</p><h3 class="mt-1 text-xl font-bold text-slate-950">{{ car.brand }} {{ car.model }} · {{ car.year }}</h3><p class="mt-1 text-sm text-slate-500">{{ car.title }}</p></div>
                <p class="text-lg font-bold text-slate-950">{{ money(car.price, car.currency) }}</p>
              </div>
              <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                <span>{{ new Intl.NumberFormat("en-GB").format(car.mileage) }} km</span><span>{{ car.city }}, {{ car.country }}</span>
                <time :datetime="car.updatedAt">Reported {{ submittedDate(car.updatedAt) }}</time>
                <span><NuxtLink :to="`/admin/users/${car.sellerId}`" class="font-semibold text-blue-700 hover:underline">{{ car.sellerName }}</NuxtLink> · {{ car.sellerEmail }}</span>
              </div>
              <p class="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{{ car.description || "No description provided." }}</p>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <NuxtLink :to="`/admin/cars/${car.id}`" class="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"><Eye class="h-4 w-4" aria-hidden="true" /> Full listing details</NuxtLink>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" :disabled="busyId !== ''" @click="rejectSaleId = rejectSaleId === car.id ? '' : car.id; saleRejectionReason = ''"><X class="h-4 w-4" aria-hidden="true" /> Reject sale</button>
                  <button type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" :disabled="busyId !== ''" @click="confirmSale(car)"><Check class="h-4 w-4" aria-hidden="true" />{{ busyId === car.id ? "Saving..." : "Confirm sale" }}</button>
                </div>
              </div>
              <div v-if="rejectSaleId === car.id" class="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <label class="block text-sm font-semibold text-slate-800">Reason for rejecting this sale <span class="text-red-600">*</span>
                  <textarea v-model="saleRejectionReason" rows="3" maxlength="2000" class="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" placeholder="Explain why this sale could not be confirmed." />
                </label>
                <div class="mt-3 flex justify-end gap-2">
                  <button type="button" class="min-h-9 cursor-pointer rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-white" @click="rejectSaleId = ''; saleRejectionReason = ''">Cancel</button>
                  <button type="button" class="min-h-9 cursor-pointer rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" :disabled="busyId !== '' || !saleRejectionReason.trim()" @click="rejectSale(car)">{{ busyId === car.id ? "Saving..." : "Confirm rejection" }}</button>
                </div>
              </div>
            </div>
          </div>
        </article>
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white"><AdminPagination :page="sales.page" :total-pages="sales.totalPages" :total="sales.total" :limit="sales.limit" @page="salePage = $event" /></div>
      </div>
      <div v-else-if="sales && !sales.items.length" class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
        <p class="text-sm font-semibold text-slate-700">No sales awaiting confirmation</p>
        <p class="mt-1 text-xs text-slate-500">Seller-reported sales will appear here.</p>
      </div>
    </section>
    <h2 class="mt-9 text-lg font-bold text-slate-950">Listings awaiting moderation</h2>
    <div v-if="data?.items.length" class="mt-6 space-y-4">
      <article v-for="car in data.items" :key="car.id" class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <div class="grid grid-cols-2 gap-1 bg-slate-100 p-1 lg:grid-cols-1">
            <SafeImage v-for="image in (car.images ?? []).slice(0, 3)" :key="image.id" :src="image.url" :alt="`${car.title} photo`" width="1920" height="1440" class="h-36 w-full rounded-lg object-cover lg:h-40" />
            <div v-if="!car.images?.length" class="flex h-44 items-center justify-center text-slate-400"><ShieldCheck class="h-8 w-8" aria-hidden="true" /></div>
          </div>
          <div class="min-w-0 p-5 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><p class="text-xs font-bold uppercase tracking-wide text-amber-600">Awaiting review</p><h2 class="mt-1 text-xl font-bold text-slate-950">{{ car.brand }} {{ car.model }} · {{ car.year }}</h2><p class="mt-1 text-sm text-slate-500">{{ car.title }}</p></div>
              <p class="text-lg font-bold text-slate-950">{{ money(car.price, car.currency) }}</p>
            </div>
            <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
              <span>{{ new Intl.NumberFormat("en-GB").format(car.mileage) }} km</span><span>{{ car.city }}, {{ car.country }}</span>
              <time :datetime="car.updatedAt">Submitted {{ submittedDate(car.updatedAt) }}</time>
              <span><NuxtLink :to="`/admin/users/${car.sellerId}`" class="font-semibold text-blue-700 hover:underline">{{ car.sellerName }}</NuxtLink> · {{ car.sellerEmail }}</span>
            </div>
            <p class="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{{ car.description || "No description provided." }}</p>
            <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <NuxtLink :to="`/admin/cars/${car.id}`" class="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"><Eye class="h-4 w-4" aria-hidden="true" /> Full listing details</NuxtLink>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" :disabled="busyId !== ''" @click="rejectId = rejectId === car.id ? '' : car.id; rejectionReason = ''"><X class="h-4 w-4" aria-hidden="true" /> Reject</button>
                <button type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" :disabled="busyId !== ''" @click="approve(car)"><Check class="h-4 w-4" aria-hidden="true" />{{ busyId === car.id ? "Saving..." : "Approve" }}</button>
              </div>
            </div>
            <div v-if="rejectId === car.id" class="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
              <label class="block text-sm font-semibold text-slate-800">Reason for rejection <span class="text-red-600">*</span>
                <textarea v-model="rejectionReason" rows="3" maxlength="2000" class="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" placeholder="Explain what needs to be corrected." />
              </label>
              <div class="mt-3 flex justify-end gap-2">
                <button type="button" class="min-h-9 cursor-pointer rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-white" @click="rejectId = ''; rejectionReason = ''">Cancel</button>
                <button type="button" class="min-h-9 cursor-pointer rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" :disabled="busyId !== '' || !rejectionReason.trim()" @click="reject(car)">{{ busyId === car.id ? "Saving..." : "Confirm rejection" }}</button>
              </div>
            </div>
          </div>
        </div>
      </article>
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white"><AdminPagination v-if="data" :page="data.page" :total-pages="data.totalPages" :total="data.total" :limit="data.limit" @page="page = $event" /></div>
    </div>
    <section v-else-if="data && data.items.length === 0" class="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck class="h-6 w-6" aria-hidden="true" /></span>
      <h2 class="mt-4 text-lg font-bold text-slate-900">Moderation queue is clear</h2>
      <p class="mt-1 text-sm text-slate-500">New listings submitted for review will appear here.</p>
    </section>
  </div>
</template>
