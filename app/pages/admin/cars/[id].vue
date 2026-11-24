<script setup lang="ts">
import { ArrowLeft, CarFront, Check, ShieldCheck } from "@lucide/vue";
import type { AdminCarDetail } from "~/../shared/types/admin";
import { syncListingPhotos } from "~/composables/syncListingPhotos";

definePageMeta({ layout: "admin", middleware: "admin" });
const route = useRoute();
const requestFetch = useRequestFetch();
const { data, error, status, refresh } = await useAsyncData(
  () => `admin-car-${route.params.id}`,
  () => requestFetch<{ listing: AdminCarDetail }>(`/api/admin/cars/${route.params.id}`),
);
const target = ref("");
const reason = ref("");
const busy = ref(false);
const actionError = ref("");
const actionSuccess = ref("");
const toastError = ref("");
const transitions: Record<AdminCarDetail["status"], string[]> = {
  DRAFT: ["PENDING", "ARCHIVED"],
  PENDING: ["ACTIVE", "REJECTED", "ARCHIVED"],
  ACTIVE: ["SOLD", "ARCHIVED"],
  SOLD: ["ACTIVE", "ARCHIVED"],
  REJECTED: ["PENDING", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};
const statusOptions = computed(() => (data.value ? transitions[data.value.listing.status].filter((status) =>
  !(data.value?.listing.status === "SOLD" && data.value.listing.saleConfirmationStatus === "PENDING" && status === "ACTIVE"),
) : []).map((status) => ({
  label: status,
  value: status,
})));
const saveStatus = async () => {
  if (!data.value || busy.value || !target.value) return;
  actionError.value = "";
  actionSuccess.value = "";
  busy.value = true;
  let updated = false;
  try {
    const nextStatus = target.value;
    const result = await $fetch<{ listing: AdminCarDetail }>(`/api/admin/cars/${data.value.listing.id}/status`, {
      method: "PATCH",
      body: { status: target.value, ...(target.value === "REJECTED" ? { reason: reason.value } : {}) },
    });
    updated = true;
    target.value = "";
    reason.value = "";
    actionSuccess.value = "Listing status updated.";
    await refresh();
    if (nextStatus === "ACTIVE") {
      const config = await $fetch<{ listingBlobEnabled: boolean }>("/api/uploads/config");
      if (config.listingBlobEnabled && await syncListingPhotos(result.listing.id, result.listing.images)) {
        actionError.value = "The listing was approved, but some photos are awaiting synchronization.";
      }
    }
  } catch (error) {
    actionError.value = updated
      ? "The status was saved, but the page or photo synchronization could not be refreshed."
      : getAuthErrorMessage(error, "Unable to update this listing.");
    toastError.value = actionError.value;
  } finally {
    busy.value = false;
  }
};
const money = (price: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(price);
useSeoMeta({ title: "Listing Details — EuroCars Admin" });
</script>

<template>
  <div>
    <AppToast :message="toastError" kind="error" @close="toastError = ''" />
    <NuxtLink to="/admin/cars" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft class="h-4 w-4" aria-hidden="true" /> Back to listings</NuxtLink>
    <div v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-5 text-sm text-red-700">Unable to load listing details. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></div>
    <p v-else-if="status === 'pending' || !data" role="status" class="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500">Loading listing details...</p>
    <template v-else>
      <AdminPageHeading eyebrow="Listing review" :title="data.listing.title" :description="`${data.listing.brand} ${data.listing.model} ${data.listing.trim ?? ''} · ${data.listing.year}`">
        <AdminStatusBadge :status="data.listing.status" />
      </AdminPageHeading>
      <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
      <p v-if="actionSuccess" role="status" class="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{{ actionSuccess }}</p>
      <div class="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section class="space-y-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div v-if="data.listing.images.length" class="grid gap-3 sm:grid-cols-2">
              <figure v-for="image in data.listing.images" :key="image.id" class="relative">
                <SafeImage :src="image.url" :alt="`${data.listing.title} photo`" width="1920" height="1440" class="h-64 w-full rounded-xl bg-slate-100 object-cover" />
                <figcaption v-if="image.isPrimary" class="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white">Main photo</figcaption>
              </figure>
            </div>
            <div v-else class="flex h-56 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><CarFront class="h-10 w-10" aria-hidden="true" /></div>
          </div>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="text-lg font-bold text-slate-950">Description</h2>
            <p class="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{{ data.listing.description || "No description provided." }}</p>
            <h3 class="mt-6 text-sm font-bold text-slate-900">Features</h3>
            <div v-if="data.listing.features.length" class="mt-3 flex flex-wrap gap-2"><span v-for="feature in data.listing.features" :key="feature" class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{{ feature }}</span></div>
            <p v-else class="mt-2 text-sm text-slate-500">No features listed.</p>
          </section>
        </section>
        <aside class="space-y-5">
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Asking price</p>
            <p class="mt-2 text-3xl font-bold text-slate-950">{{ money(data.listing.price, data.listing.currency) }}</p>
            <dl class="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div><dt class="text-xs text-slate-500">Mileage</dt><dd class="mt-1 font-semibold">{{ new Intl.NumberFormat("en-GB").format(data.listing.mileage) }} km</dd></div>
              <div><dt class="text-xs text-slate-500">Fuel</dt><dd class="mt-1 font-semibold">{{ data.listing.fuelType }}</dd></div>
              <div><dt class="text-xs text-slate-500">Transmission</dt><dd class="mt-1 font-semibold">{{ data.listing.transmission }}</dd></div>
              <div><dt class="text-xs text-slate-500">Location</dt><dd class="mt-1 font-semibold">{{ data.listing.city }}, {{ data.listing.country }}</dd></div>
            </dl>
          </section>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="font-bold text-slate-950">Seller</h2>
            <NuxtLink :to="`/admin/users/${data.listing.sellerId}`" class="mt-3 block font-semibold text-blue-700 hover:underline">{{ data.listing.sellerName }}</NuxtLink>
            <a :href="`mailto:${data.listing.sellerEmail}`" class="mt-1 block break-all text-sm text-slate-500 hover:text-blue-700">{{ data.listing.sellerEmail }}</a>
          </section>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2"><ShieldCheck class="h-5 w-5 text-blue-600" aria-hidden="true" /><h2 class="font-bold text-slate-950">Update status</h2></div>
            <p v-if="data.listing.moderationReason" class="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">Previous rejection: {{ data.listing.moderationReason }}</p>
            <div class="mt-4 block text-xs font-semibold text-slate-600">New status
              <AppSelect v-model="target" :options="statusOptions" label="New listing status" placeholder="Select status" :disabled="busy" />
            </div>
            <label v-if="target === 'REJECTED'" class="mt-4 block text-xs font-semibold text-slate-600">Rejection reason *
              <textarea v-model="reason" rows="3" maxlength="2000" class="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Explain why this listing was rejected." />
            </label>
            <button type="button" class="mt-4 inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" :disabled="busy || !target || (target === 'REJECTED' && !reason.trim())" @click="saveStatus">
              <Check class="h-4 w-4" aria-hidden="true" />{{ busy ? "Saving..." : "Save status" }}
            </button>
            <p class="mt-3 text-xs leading-5 text-slate-500">Status changes and review decisions are recorded in the audit log.</p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
