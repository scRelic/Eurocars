<script setup lang="ts">
import { ArrowRight, CarFront, Globe2 } from "@lucide/vue";

const currentYear = new Date().getFullYear();
const { user, isAuthReady, authError, logout } = useAuth();
const signOutError = ref("");
const isSigningOut = ref(false);
const marketplaceLinks = [
  { label: "Browse Cars", to: "/cars" },
  { label: "New Arrivals", to: "/cars?sort=year-desc" },
];
const accountLinks = computed(() => user.value
  ? [{ label: "My profile", to: "/profile" }, { label: "My listings", to: "/account/listings" }]
  : [{ label: "Sign in", to: "/login" }, { label: "Create an account", to: "/register" }]);

const signOut = async () => {
  signOutError.value = "";
  isSigningOut.value = true;
  try {
    await logout();
    await navigateTo("/");
  } catch (error) {
    signOutError.value = getAuthErrorMessage(error, "Unable to sign out. Please try again.");
  } finally {
    isSigningOut.value = false;
  }
};
</script>

<template>
  <footer class="bg-brand-navy text-slate-300">
    <div class="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-5 border-b border-white/10 py-8 sm:flex-row sm:items-center sm:justify-between sm:py-10">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Your next journey starts here</p>
          <h2 class="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Ready to find your next car?</h2>
        </div>
        <NuxtLink to="/cars" class="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-brand-navy transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">Explore Cars <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink>
      </div>

      <div class="grid grid-cols-2 gap-x-6 gap-y-10 py-10 sm:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] lg:gap-12 lg:py-14">
        <div class="col-span-2 max-w-sm sm:col-span-3 lg:col-span-1">
          <NuxtLink to="/" aria-label="EuroCars home" class="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
            <span class="text-xl font-extrabold tracking-tight text-white">Euro<span class="text-blue-400">Cars</span></span>
          </NuxtLink>
          <p class="mt-5 text-sm leading-7 text-slate-400">A simpler way to discover cars, connect with sellers and explore the European market.</p>
          <p class="mt-5 inline-flex items-center gap-2 text-xs font-medium text-slate-400"><Globe2 class="h-4 w-4 text-blue-400" aria-hidden="true" /> European Car Marketplace</p>
        </div>

        <nav aria-label="Marketplace">
          <h2 class="text-sm font-bold text-white">Marketplace</h2>
          <ul class="mt-5 space-y-3">
            <li v-for="link in marketplaceLinks" :key="link.to"><NuxtLink :to="link.to" class="rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">{{ link.label }}</NuxtLink></li>
          </ul>
        </nav>
        <nav aria-label="Selling">
          <h2 class="text-sm font-bold text-white">Selling</h2>
          <ul class="mt-5 space-y-3">
            <li><NuxtLink to="/sell" class="rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">Sell Your Car</NuxtLink></li>
            <li v-if="user"><NuxtLink to="/account/listings" class="rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">My Listings</NuxtLink></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 class="text-sm font-bold text-white">Account</h2>
          <ul v-if="isAuthReady && (user || !authError)" class="mt-5 space-y-3">
            <li v-for="link in accountLinks" :key="link.to"><NuxtLink :to="link.to" class="rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">{{ link.label }}</NuxtLink></li>
            <li v-if="user"><button type="button" class="cursor-pointer rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-60" :disabled="isSigningOut" @click="signOut">{{ isSigningOut ? "Signing out..." : "Sign out" }}</button></li>
          </ul>
          <p v-if="authError && !user" role="alert" class="mt-3 text-xs text-red-300">{{ authError }}</p>
          <p v-if="signOutError" role="alert" class="mt-3 text-xs text-red-300">{{ signOutError }}</p>
        </nav>
      </div>

      <div class="border-t border-white/10 py-5 text-xs text-slate-400">© {{ currentYear }} EuroCars. All rights reserved.</div>
    </div>
  </footer>
</template>