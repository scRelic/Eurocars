<script setup lang="ts">
import { ArrowLeft, Building2, ExternalLink, ShieldCheck } from "@lucide/vue";
import type { AdminDealer } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
const route = useRoute();
const requestFetch = useRequestFetch();
const { data, error, status, refresh } = await useAsyncData(
  () => `admin-dealer-${route.params.id}`,
  () => requestFetch<{ dealer: AdminDealer }>(`/api/admin/dealers/${route.params.id}`),
);
const actionError = ref("");
const busy = ref(false);
const safeWebsite = computed(() => {
  const value = data.value?.dealer.websiteUrl;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
});
const toggleVerification = async () => {
  if (!data.value || busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    await $fetch(`/api/admin/dealers/${data.value.dealer.id}/verification`, {
      method: "PATCH",
      body: { verified: !data.value.dealer.isVerified },
    });
    await refresh();
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to update dealership verification.");
  } finally {
    busy.value = false;
  }
};
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(value));
</script>

<template>
  <div>
    <NuxtLink to="/admin/dealers" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft class="h-4 w-4" aria-hidden="true" /> Back to dealerships</NuxtLink>
    <p v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-5 text-sm text-red-700">Unable to load dealership details. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
    <p v-else-if="status === 'pending' || !data" role="status" class="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500">Loading dealership profile...</p>
    <template v-else>
      <AdminPageHeading eyebrow="Business profile" :title="data.dealer.name" :description="[data.dealer.city, data.dealer.country].filter(Boolean).join(', ') || 'Dealership location not provided'">
        <AdminStatusBadge :status="data.dealer.isVerified ? 'VERIFIED' : 'UNVERIFIED'" />
      </AdminPageHeading>
      <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-4"><SafeImage v-if="data.dealer.logoUrl" :src="data.dealer.logoUrl" :alt="`${data.dealer.name} logo`" width="256" height="256" class="h-16 w-16 rounded-xl object-cover" /><span v-else class="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Building2 class="h-7 w-7" aria-hidden="true" /></span><div><h2 class="text-lg font-bold text-slate-950">Dealership information</h2><p class="text-sm text-slate-500">Registered {{ date(data.dealer.createdAt) }}</p></div></div>
          <p class="mt-6 whitespace-pre-line text-sm leading-7 text-slate-600">{{ data.dealer.description || "No description provided." }}</p>
          <dl class="mt-7 grid gap-5 sm:grid-cols-2">
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ [data.dealer.address, data.dealer.city, data.dealer.country].filter(Boolean).join(", ") || "Not provided" }}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ data.dealer.phone || "Not provided" }}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Website</dt><dd class="mt-1 text-sm font-medium"><a v-if="safeWebsite" :href="safeWebsite" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 break-all text-blue-700 hover:underline">{{ data.dealer.websiteUrl }}<ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" /></a><span v-else class="text-slate-500">{{ data.dealer.websiteUrl || "Not provided" }}</span></dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Listings</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ data.dealer.listingCount }}</dd></div>
          </dl>
        </section>
        <aside class="space-y-5">
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 class="font-bold text-slate-950">Account owner</h2><NuxtLink :to="`/admin/users/${data.dealer.ownerId}`" class="mt-3 block font-semibold text-blue-700 hover:underline">{{ data.dealer.ownerName }}</NuxtLink><a :href="`mailto:${data.dealer.ownerEmail}`" class="mt-1 block break-all text-sm text-slate-500 hover:text-blue-700">{{ data.dealer.ownerEmail }}</a></section>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 class="flex items-center gap-2 font-bold text-slate-950"><ShieldCheck class="h-4 w-4 text-blue-600" aria-hidden="true" />Verification</h2><p class="mt-2 text-xs leading-5 text-slate-500">Verification changes are recorded in the administrator audit log.</p><button type="button" class="mt-4 min-h-10 w-full cursor-pointer rounded-lg border text-sm font-semibold disabled:opacity-50" :class="data.dealer.isVerified ? 'border-slate-200 text-slate-700 hover:bg-slate-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'" :disabled="busy" @click="toggleVerification">{{ busy ? "Saving..." : data.dealer.isVerified ? "Revoke verification" : "Verify dealership" }}</button></section>
        </aside>
      </div>
    </template>
  </div>
</template>
