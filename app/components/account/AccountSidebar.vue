<script setup lang="ts">
import { Bell, CarFront, ChevronDown, Heart, LayoutDashboard, LogOut, MessageSquare, Settings, ShieldCheck } from "@lucide/vue";
import type { Component } from "vue";

type AccountLink = {
  label: string;
  path: string;
  icon: Component;
};

const links: AccountLink[] = [
  { label: "Overview", path: "/profile", icon: LayoutDashboard },
  { label: "My Listings", path: "/account/listings", icon: CarFront },
  { label: "Favorites", path: "/account/favorites", icon: Heart },
  { label: "Messages", path: "/account/messages", icon: MessageSquare },
  { label: "Notifications", path: "/account/notifications", icon: Bell },
  { label: "Profile Settings", path: "/account/settings", icon: Settings },
  { label: "Security", path: "/account/security", icon: ShieldCheck },
];

const route = useRoute();
const { logout } = useAuth();
const isMenuOpen = ref(false);
const isSigningOut = ref(false);
const errorMessage = ref("");
const isActive = (path: string) => route.path === path || (path === "/account/listings" && route.path.startsWith("/account/listing-edit/"));
const currentLabel = computed(() => links.find((link) => isActive(link.path))?.label ?? "Account");

const signOut = async () => {
  errorMessage.value = "";
  isSigningOut.value = true;
  try {
    await logout();
    await navigateTo("/");
  } catch (error) {
    errorMessage.value = getAuthErrorMessage(error, "Unable to sign out. Please try again.");
  } finally {
    isSigningOut.value = false;
  }
};
</script>

<template>
  <aside class="min-w-0 md:w-20 md:shrink-0 lg:w-64">
    <div class="rounded-2xl border border-brand-border bg-white p-3 shadow-lg shadow-brand-navy/5">
      <button
        type="button"
        class="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 md:hidden"
        :aria-expanded="isMenuOpen"
        aria-controls="account-navigation"
        @click="isMenuOpen = !isMenuOpen"
      >
        <span>{{ currentLabel }}</span>
        <ChevronDown class="h-5 w-5 text-slate-500 transition" :class="isMenuOpen ? 'rotate-180' : ''" aria-hidden="true" />
      </button>

      <div id="account-navigation" :class="isMenuOpen ? 'block' : 'hidden'" class="md:block">
        <p class="hidden px-3 pb-3 pt-2 text-xs font-bold uppercase tracking-wider text-slate-600 lg:block">Your account</p>
        <nav aria-label="Account navigation" class="space-y-1">
          <NuxtLink
            v-for="link in links"
            :key="link.path"
            :to="link.path"
            :aria-current="isActive(link.path) ? 'page' : undefined"
            :title="link.label"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-blue-600 md:justify-center md:px-0 lg:justify-start lg:px-3"
            :class="isActive(link.path) ? 'bg-brand-navy text-white shadow-sm' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'"
            @click="isMenuOpen = false"
          >
            <component :is="link.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span class="md:sr-only lg:not-sr-only">{{ link.label }}</span>
          </NuxtLink>
        </nav>
        <div class="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 md:justify-center md:px-0 lg:justify-start lg:px-3"
            :disabled="isSigningOut"
            :title="isSigningOut ? 'Signing out...' : 'Sign out'"
            @click="signOut"
          >
            <LogOut class="h-5 w-5 shrink-0" aria-hidden="true" />
            <span class="md:sr-only lg:not-sr-only">{{ isSigningOut ? "Signing out..." : "Sign Out" }}</span>
          </button>
          <p v-if="errorMessage" role="alert" class="mt-2 break-words px-2 text-xs leading-5 text-red-700">{{ errorMessage }}</p>
        </div>
      </div>
    </div>
  </aside>
</template>
