<script setup lang="ts">
import { Building2, Search, ShieldCheck } from "@lucide/vue";
import type { AdminDealer, AdminPageResult } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Dealerships — EuroCars Admin" });

const requestFetch = useRequestFetch();
const searchInput = ref("");
const search = ref("");
const verified = ref("");
const sort = ref("newest");
const page = ref(1);
const busyId = ref("");
const actionError = ref("");
const verificationOptions = [
  { label: "All verification states", value: "" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Unverified", value: "UNVERIFIED" },
];
const sortOptions = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Name A–Z", value: "name-asc" },
];
let timer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { search.value = value.trim(); page.value = 1; }, 250);
});
watch([verified, sort], () => { page.value = 1; });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), limit: "20", sort: sort.value });
  if (search.value) params.set("search", search.value);
  if (verified.value) params.set("verified", verified.value);
  return params.toString();
});
const { data, error, refresh } = await useAsyncData(
  "admin-dealers", () => requestFetch<AdminPageResult<AdminDealer>>(`/api/admin/dealers?${query.value}`), { watch: [query] },
);
const setVerified = async (dealer: AdminDealer) => {
  actionError.value = "";
  busyId.value = dealer.id;
  try {
    await $fetch(`/api/admin/dealers/${dealer.id}/verification`, {
      method: "PATCH",
      body: { verified: !dealer.isVerified },
    });
    await refresh();
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to update dealership verification.");
  } finally {
    busyId.value = "";
  }
};
</script>

<template>
  <div>
    <AdminPageHeading eyebrow="Business accounts" title="Dealerships" description="Review dealer profiles and manage marketplace verification." />
    <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <section class="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[minmax(220px,1fr)_190px_170px]">
        <label class="relative"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input v-model="searchInput" type="search" aria-label="Search dealerships" class="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Search dealer, owner or city"></label>
        <AppSelect v-model="verified" :options="verificationOptions" label="Verification status" placeholder="All verification states" />
        <AppSelect v-model="sort" :options="sortOptions" label="Sort dealerships" placeholder="Newest first" />
      </div>
      <p v-if="error" role="alert" class="p-8 text-center text-sm text-red-700">Could not load dealerships. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
      <p v-else-if="!data" role="status" class="p-8 text-center text-sm text-slate-500">Loading dealerships...</p>
      <div v-else-if="data?.items.length" class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-left text-sm">
          <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3">Dealership</th><th class="px-4 py-3">Owner</th><th class="px-4 py-3">Location</th><th class="px-4 py-3">Listings</th><th class="px-4 py-3">Verification</th><th class="px-5 py-3 text-right">Action</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="dealer in data.items" :key="dealer.id" class="hover:bg-slate-50/70">
              <td class="px-5 py-4"><div class="flex items-center gap-3"><SafeImage v-if="dealer.logoUrl" :src="dealer.logoUrl" alt="" width="256" height="256" class="h-10 w-10 rounded-lg object-cover" /><span v-else class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Building2 class="h-5 w-5" aria-hidden="true" /></span><NuxtLink :to="`/admin/dealers/${dealer.id}`" class="font-semibold text-blue-700 hover:underline">{{ dealer.name }}</NuxtLink></div></td>
              <td class="px-4 py-4"><NuxtLink :to="`/admin/users/${dealer.ownerId}`" class="font-medium text-slate-800 hover:text-blue-700">{{ dealer.ownerName }}</NuxtLink><p class="mt-1 text-xs text-slate-500">{{ dealer.ownerEmail }}</p></td>
              <td class="px-4 py-4 text-slate-600">{{ [dealer.city, dealer.country].filter(Boolean).join(", ") || "Not provided" }}</td>
              <td class="px-4 py-4 font-medium">{{ dealer.listingCount }}</td>
              <td class="px-4 py-4"><AdminStatusBadge :status="dealer.isVerified ? 'VERIFIED' : 'UNVERIFIED'" /></td>
              <td class="px-5 py-4 text-right"><button type="button" class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-50" :class="dealer.isVerified ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'" :disabled="busyId !== ''" @click="setVerified(dealer)"><ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />{{ busyId === dealer.id ? "Saving..." : dealer.isVerified ? "Revoke" : "Verify" }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-12 text-center text-sm text-slate-500">No dealerships match these filters.</div>
      <AdminPagination v-if="data" :page="data.page" :total-pages="data.totalPages" :total="data.total" :limit="data.limit" @page="page = $event" />
    </section>
  </div>
</template>
