<script setup lang="ts">
import { CarFront, LayoutGrid, List, Plus, Search } from "@lucide/vue";
import type { Listing } from "~/../shared/types/listing";

definePageMeta({ layout: "account", middleware: "auth" });

type StatusFilter = "All" | "Active" | "Pending" | "Draft" | "Sold" | "Rejected" | "Archived";
const statuses: StatusFilter[] = ["All", "Active", "Pending", "Draft", "Sold", "Rejected", "Archived"];
const selectedStatus = ref<StatusFilter>("All");
const search = ref("");
const sort = ref("recent");
const view = ref<"grid" | "list">("list");
const sortOptions = [
  { label: "Recently updated", value: "recent" },
  { label: "Newest model year", value: "year" },
  { label: "Lowest mileage", value: "mileage" },
];
const { user } = useAuth();
const requestFetch = useRequestFetch();
const { data, error, status: loadStatus, refresh } = await useAsyncData(
  () => `own-listings-${user.value?.id ?? "guest"}`,
  () => requestFetch<{ items: Listing[] }>("/api/users/me/cars"),
);
const filteredListings = computed(() => {
  const term = search.value.trim().toLowerCase();
  const items = (data.value?.items ?? []).filter((listing) =>
    (selectedStatus.value === "All" || listing.status === selectedStatus.value.toUpperCase()) &&
    (!term || [listing.title, listing.brandName, listing.modelName].some((value) => value.toLowerCase().includes(term))),
  );
  if (sort.value === "year") items.sort((a, b) => b.year - a.year);
  if (sort.value === "mileage") items.sort((a, b) => a.mileage - b.mileage);
  return items;
});
const actionError = ref("");
const busyId = ref<string | null>(null);
const archiveListing = ref<Listing | null>(null);
const soldListing = ref<Listing | null>(null);
const toastMessage = ref("");
const changeStatus = async (listing: Listing, status: "PENDING" | "SOLD" | "ARCHIVED") => {
  if (busyId.value) return;
  actionError.value = "";
  busyId.value = listing.id;
  try {
    if (status === "ARCHIVED") {
      await $fetch(`/api/cars/${listing.id}`, { method: "DELETE" });
    } else {
      await $fetch(`/api/cars/${listing.id}`, { method: "PATCH", body: { status } });
    }
    await refresh();
    if (status === "ARCHIVED") {
      archiveListing.value = null;
      toastMessage.value = "Listing archived.";
    } else if (status === "SOLD") {
      soldListing.value = null;
      toastMessage.value = "Sale submitted for confirmation.";
    }
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to update the listing. Please try again.");
  } finally {
    busyId.value = null;
  }
};

useSeoMeta({ title: "My listings — EuroCars", description: "Manage your car listings." });
</script>

<template>
  <div>
    <AppToast :message="toastMessage" @close="toastMessage = ''" />
    <ConfirmModal v-if="archiveListing" title="Archive listing?" :subject="archiveListing.title" description="This listing will no longer be publicly visible." confirm-label="Archive listing" :busy="busyId !== null" :error="actionError" @close="archiveListing = null; actionError = ''" @confirm="changeStatus(archiveListing, 'ARCHIVED')" />
    <ConfirmModal v-if="soldListing" title="Report this car as sold?" :subject="soldListing.title" description="The listing will be hidden while the sale is reviewed." confirm-label="Report sale" :busy="busyId !== null" :error="actionError" @close="soldListing = null; actionError = ''" @confirm="changeStatus(soldListing, 'SOLD')" />
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold text-blue-600">Your garage</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">My Listings</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">Manage your car listings in one place.</p>
      </div>
      <NuxtLink to="/sell" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <Plus class="h-4 w-4" aria-hidden="true" /> Sell a Car
      </NuxtLink>
    </header>

    <div class="mt-7 flex flex-wrap gap-2" role="group" aria-label="Filter listings by status">
      <button
        v-for="status in statuses"
        :key="status"
        type="button"
        class="min-h-10 cursor-pointer rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        :class="selectedStatus === status ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'"
        :aria-pressed="selectedStatus === status"
        @click="selectedStatus = status"
      >
        {{ status }}
      </button>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-border bg-white p-3 shadow-sm">
      <label class="relative min-w-0 flex-1 basis-48">
        <span class="sr-only">Search your listings</span>
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input v-model="search" type="search" placeholder="Search title, make or model" class="search-input pl-10">
      </label>
      <div class="w-full sm:w-48"><AppSelect v-model="sort" :options="sortOptions" label="Sort your listings" placeholder="Recently updated" /></div>
      <div role="group" aria-label="Listings view" class="flex rounded-xl border border-slate-200 p-1">
        <button type="button" aria-label="List view" :aria-pressed="view === 'list'" class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600" :class="view === 'list' ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100'" @click="view = 'list'"><List class="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" aria-label="Grid view" :aria-pressed="view === 'grid'" class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600" :class="view === 'grid' ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100'" @click="view = 'grid'"><LayoutGrid class="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>

    <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <div v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-5 text-sm text-red-700">
      Unable to load your listings.
      <button type="button" class="ml-2 cursor-pointer font-semibold underline" @click="refresh()">Try again</button>
    </div>
    <p v-else-if="loadStatus === 'pending'" class="mt-6 text-sm text-slate-600">Loading listings...</p>
    <div v-else-if="filteredListings.length" class="mt-6 grid gap-4" :class="view === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : ''">
      <article v-for="listing in filteredListings" :key="listing.id" class="flex min-w-0 flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" :class="view === 'list' ? 'sm:flex-row' : ''">
        <SafeImage v-if="listing.imageUrl" :src="listing.imageUrl" :alt="listing.title" width="640" height="400" class="h-40 w-full rounded-xl object-cover" :class="view === 'list' ? 'sm:w-48' : ''" />
        <div v-else class="flex h-40 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-400" :class="view === 'list' ? 'sm:w-48' : ''"><CarFront class="h-8 w-8" aria-hidden="true" /></div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <h2 class="break-words text-lg font-bold text-slate-950">{{ listing.title }}</h2>
            <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">{{ listing.status.toLowerCase() }}</span>
          </div>
          <p class="mt-2 font-semibold text-slate-900">{{ new Intl.NumberFormat("en-GB", { style: "currency", currency: listing.currency }).format(listing.price) }}</p>
          <p v-if="listing.status === 'SOLD' && listing.saleConfirmationStatus === 'PENDING'" class="mt-2 text-sm font-medium text-amber-700">Sale confirmation is pending moderator review.</p>
          <p v-else-if="listing.saleConfirmationStatus === 'REJECTED'" class="mt-2 text-sm text-red-700">Sale was not confirmed: {{ listing.saleConfirmationReason || "Please contact support for details." }} The listing is active again.</p>
          <p class="mt-1 text-sm text-slate-500">{{ listing.year }} · {{ new Intl.NumberFormat("en-GB").format(listing.mileage) }} km · {{ listing.views }} views</p>
          <div class="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <NuxtLink :to="`/account/listing-edit/${listing.id}`" class="text-blue-600 hover:text-blue-800">Edit</NuxtLink>
            <NuxtLink v-if="listing.status === 'ACTIVE'" :to="`/cars/${listing.id}`" class="text-blue-600 hover:text-blue-800">View listing</NuxtLink>
            <button v-if="listing.status !== 'ACTIVE' && listing.status !== 'PENDING'" type="button" class="cursor-pointer text-blue-600 hover:text-blue-800 disabled:opacity-50" :disabled="busyId !== null" @click="changeStatus(listing, 'PENDING')">Submit for review</button>
            <button v-if="listing.status === 'ACTIVE'" type="button" class="cursor-pointer text-blue-600 hover:text-blue-800 disabled:opacity-50" :disabled="busyId !== null" @click="actionError = ''; soldListing = listing">Mark sold</button>
            <button v-if="listing.status !== 'ARCHIVED'" type="button" class="cursor-pointer text-red-700 hover:text-red-900 disabled:opacity-50" :disabled="busyId !== null" @click="actionError = ''; archiveListing = listing">Archive</button>
          </div>
        </div>
      </article>
    </div>
    <div v-else class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center sm:py-20">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CarFront class="h-6 w-6" aria-hidden="true" /></span>
      <h2 class="mt-5 text-xl font-bold text-slate-950">No listings found</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        {{ search.trim() ? "No listings match your search." : `You have no ${selectedStatus === "All" ? "listings" : `${selectedStatus.toLowerCase()} listings`} yet.` }}
      </p>
      <NuxtLink to="/sell" class="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Create Your First Listing
      </NuxtLink>
    </div>
  </div>
</template>
