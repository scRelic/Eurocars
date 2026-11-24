<script setup lang="ts">
import { ArrowRight, CarFront, CircleCheck, Clock3, Heart, MessageSquare, Plus, Settings } from "@lucide/vue";
import type { Listing } from "~/../shared/types/listing";
import type { Conversation } from "~/../shared/types/messages";

definePageMeta({ layout: "account", middleware: "auth" });

const { user } = useAuth();
const requestFetch = useRequestFetch();
const { data: listings, error: listingsError } = await useAsyncData(
  () => `own-listings-${user.value?.id ?? "guest"}`,
  () => requestFetch<{ items: Listing[] }>("/api/users/me/cars"),
);
const { items: favorites, loading: favoritesLoading, error: favoritesError, loadedFor } = useFavorites();
const { data: conversations, error: conversationsError } = await useAsyncData(
  () => `account-conversations-${user.value?.id ?? "guest"}`,
  () => requestFetch<{ items: Conversation[] }>("/api/conversations"),
);
const stats = computed(() => [
  { label: "My Listings", value: listings.value ? String(listings.value.items.length) : "—", detail: listingsError.value ? "Unable to load" : "Your listings", icon: CarFront, path: "/account/listings" },
  { label: "Active Listings", value: listings.value ? String(listings.value.items.filter((item) => item.status === "ACTIVE").length) : "—", detail: listingsError.value ? "Unable to load" : "Currently active", icon: CircleCheck, path: "/account/listings" },
  { label: "Pending Listings", value: listings.value ? String(listings.value.items.filter((item) => item.status === "PENDING").length) : "—", detail: listingsError.value ? "Unable to load" : "Awaiting review", icon: Clock3, path: "/account/listings" },
  { label: "Saved Cars", value: loadedFor.value === user.value?.id && !favoritesError.value ? String(favorites.value.length) : "—", detail: favoritesError.value ? "Unable to load" : favoritesLoading.value ? "Loading..." : "Your saved cars", icon: Heart, path: "/account/favorites" },
  { label: "Unread Messages", value: conversations.value ? String(conversations.value.items.reduce((sum, item) => sum + item.unread, 0)) : "—", detail: conversationsError.value ? "Unable to load" : "Your inbox", icon: MessageSquare, path: "/account/messages" },
]);

useSeoMeta({ title: "Account overview — EuroCars", description: "Manage your EuroCars account." });
</script>

<template>
  <div v-if="user" class="space-y-7">
    <header class="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div class="flex min-w-0 items-center gap-4">
        <AccountAvatar :user="user" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-blue-600">Account overview</p>
          <h1 class="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {{ user.firstName ? `Welcome back, ${user.firstName}!` : "Welcome back!" }}
          </h1>
          <p class="mt-1 break-all text-sm text-slate-500">{{ user.email }}</p>
        </div>
      </div>
      <NuxtLink to="/sell" class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <Plus class="h-4 w-4" aria-hidden="true" /> Sell a Car
      </NuxtLink>
    </header>

    <section aria-label="Account statistics" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <NuxtLink
        v-for="stat in stats"
        :key="stat.label"
        :to="stat.path"
        class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-semibold text-slate-600">{{ stat.label }}</span>
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <component :is="stat.icon" class="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
        <p class="mt-4 text-3xl font-bold tracking-tight text-slate-950">{{ stat.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ stat.detail }}</p>
      </NuxtLink>
    </section>

    <section class="rounded-2xl border border-brand-border bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-xs font-bold uppercase tracking-wider text-blue-600">Your garage</p><h2 class="mt-1 text-lg font-bold text-brand-navy">Recent listings</h2></div>
        <NuxtLink to="/account/listings" class="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">View all <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink>
      </div>
      <p v-if="listingsError" role="alert" class="mt-5 text-sm text-red-700">Unable to load your listings.</p>
      <p v-else-if="!listings" role="status" class="mt-5 text-sm text-slate-500">Loading listings...</p>
      <div v-else-if="listings.items.length" class="mt-4 divide-y divide-slate-100">
        <article v-for="listing in listings.items.slice(0, 3)" :key="listing.id" class="flex items-center gap-3 py-3">
          <SafeImage v-if="listing.imageUrl" :src="listing.imageUrl" :alt="listing.title" width="320" height="240" class="h-14 w-16 shrink-0 rounded-lg bg-slate-100 object-cover" />
          <span v-else class="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
          <div class="min-w-0 flex-1"><NuxtLink :to="`/account/listing-edit/${listing.id}`" class="block truncate text-sm font-bold text-slate-900 hover:text-blue-700">{{ listing.title }}</NuxtLink><p class="mt-1 text-xs text-slate-500">{{ listing.year }} · {{ new Intl.NumberFormat("en-GB").format(listing.mileage) }} km</p></div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{{ listing.status.toLowerCase() }}</span>
        </article>
      </div>
      <p v-else class="mt-5 text-sm text-slate-500">You haven't created a listing yet.</p>
    </section>
    <div class="grid gap-5 lg:grid-cols-2">
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
        <h2 class="mt-4 text-lg font-bold text-slate-950">Your listings</h2>
        <p class="mt-2 text-sm leading-6 text-slate-600">Manage your listings and submit them for review.</p>
        <NuxtLink to="/account/listings" class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          View listings <ArrowRight class="h-4 w-4" aria-hidden="true" />
        </NuxtLink>
      </section>
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Settings class="h-5 w-5" aria-hidden="true" /></span>
        <h2 class="mt-4 text-lg font-bold text-slate-950">Profile settings</h2>
        <p class="mt-2 text-sm leading-6 text-slate-600">Review and update your account details.</p>
        <NuxtLink to="/account/settings" class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Edit profile <ArrowRight class="h-4 w-4" aria-hidden="true" />
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
