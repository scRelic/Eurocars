<script setup lang="ts">
import { Heart } from "@lucide/vue";
const { user, isAuthReady } = useAuth();
const { items: favoriteCars, loading, error, load } = useFavorites();
</script>

<template>
  <div>
    <div class="mb-8">
      <p class="text-sm font-semibold text-blue-600">Your shortlist</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Favorite cars</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">Your saved cars are available whenever you sign in.</p>
    </div>
    <div v-if="error" role="alert" class="rounded-xl bg-red-50 p-4 text-sm text-red-700">
      {{ error }} <button type="button" class="cursor-pointer font-semibold underline" @click="load()">Try again</button>
    </div>
    <p v-else-if="loading || !isAuthReady" role="status" class="rounded-xl bg-white p-5 text-sm text-slate-500">Loading saved cars...</p>
    <div v-else-if="!user" class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
      <h2 class="text-xl font-bold text-slate-950">Sign in to save cars</h2>
      <NuxtLink to="/login" class="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Sign in</NuxtLink>
    </div>
    <div v-else-if="favoriteCars.length" class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <CarCard v-for="car in favoriteCars" :key="car.id" :car="car" class="h-full min-w-0" />
    </div>
    <div v-else class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center sm:py-20">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Heart class="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 class="mt-5 text-xl font-bold text-slate-950">No saved cars yet</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Save cars you like to keep them all in one place while you browse.</p>
      <NuxtLink to="/cars" class="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Browse Cars
      </NuxtLink>
    </div>
  </div>
</template>
