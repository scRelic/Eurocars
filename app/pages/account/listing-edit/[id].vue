<script setup lang="ts">
import type { Listing } from "~/../shared/types/listing";

definePageMeta({ layout: "account", middleware: "auth" });
const route = useRoute();
const { user } = useAuth();
const requestFetch = useRequestFetch();
const { data, error, refresh } = await useAsyncData(
  () => `own-listing-${user.value?.id ?? "guest"}-${route.params.id}`,
  () => requestFetch<{ listing: Listing }>(`/api/users/me/cars/${route.params.id}`),
);
useSeoMeta({ title: "Edit listing — EuroCars" });
</script>

<template>
  <div>
    <NuxtLink to="/account/listings" class="text-sm font-semibold text-blue-600 hover:text-blue-700">Back to listings</NuxtLink>
    <h1 class="mb-6 mt-3 text-3xl font-bold text-slate-950">Edit listing</h1>
    <div v-if="error" role="alert" class="rounded-xl bg-red-50 p-5 text-sm text-red-700">
      Unable to load this listing.
      <button class="ml-2 cursor-pointer font-semibold underline" type="button" @click="refresh()">Try again</button>
    </div>
    <ListingWizard v-else-if="data" :key="data.listing.id" :initial="data.listing" />
  </div>
</template>
