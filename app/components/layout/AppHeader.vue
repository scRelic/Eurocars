<script setup lang="ts">
import { ArrowRight, Bell, CarFront, ChevronDown, Globe2, Heart, LogIn, LogOut, Menu, MessageSquare, Plus, Search, ShieldCheck, UserRound, X } from "@lucide/vue";
import type { Component } from "vue";

type AccountNavigationItem = { label: string; path: string; icon: Component };
type NavigationItem = { label: string; path: string; kind: "browse" | "new-arrivals" | "sell" };

const route = useRoute();
const navigation: NavigationItem[] = [
  { label: "Buy Cars", path: "/cars", kind: "browse" },
  { label: "New Arrivals", path: "/cars?sort=year-desc", kind: "new-arrivals" },
  { label: "Sell a Car", path: "/sell", kind: "sell" },
];
const { items: favoriteCars } = useFavorites();
const { user, isAuthReady, authError, logout } = useAuth();
const { unreadCount, countError, refreshCount } = useNotifications();
const accountNavigation = computed<AccountNavigationItem[]>(() => [
  { label: "My Profile", path: "/profile", icon: UserRound },
  { label: "My Listings", path: "/account/listings", icon: CarFront },
  { label: "Favorites", path: "/account/favorites", icon: Heart },
  { label: "Messages", path: "/account/messages", icon: MessageSquare },
  ...(user.value?.role === "ADMIN" ? [{ label: "Admin Panel", path: "/admin", icon: ShieldCheck }] : []),
]);

const searchTerm = ref(typeof route.query.search === "string" ? route.query.search : "");
const isScrolled = ref(false);
const isAccountMenuOpen = ref(false);
const isMobileMenuOpen = ref(false);
const isSearchOpen = ref(false);
const isSigningOut = ref(false);
const accountMenuRoot = ref<HTMLDivElement | null>(null);
const accountButton = ref<HTMLButtonElement | null>(null);
const searchButton = ref<HTMLButtonElement | null>(null);
const mobileMenuButton = ref<HTMLButtonElement | null>(null);
let notificationTimer: ReturnType<typeof setInterval> | undefined;

const isActive = (item: NavigationItem) => item.kind === "sell"
  ? route.path === "/sell"
  : item.kind === "new-arrivals"
    ? route.path === "/cars" && route.query.sort === "year-desc"
    : route.path === "/cars" && route.query.sort !== "year-desc";

function closeAccountMenu(restoreFocus = false) {
  const wasOpen = isAccountMenuOpen.value;
  isAccountMenuOpen.value = false;
  if (restoreFocus && wasOpen) accountButton.value?.focus();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !accountMenuRoot.value?.contains(event.target)) closeAccountMenu();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeAccountMenu(true);
    if (isMobileMenuOpen.value) mobileMenuButton.value?.focus();
    else if (isSearchOpen.value) searchButton.value?.focus();
    isMobileMenuOpen.value = false;
    isSearchOpen.value = false;
  }
}

async function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value;
  isMobileMenuOpen.value = false;
  closeAccountMenu();
  if (isSearchOpen.value) {
    await nextTick();
    document.getElementById("header-car-search")?.focus();
  }
}

async function submitSearch() {
  const search = searchTerm.value.trim();
  isSearchOpen.value = false;
  isMobileMenuOpen.value = false;
  return navigateTo(search ? { path: "/cars", query: { search } } : "/cars");
}

async function signOut() {
  if (isSigningOut.value) return;
  isSigningOut.value = true;
  try {
    await logout();
    closeAccountMenu();
    isMobileMenuOpen.value = false;
    await navigateTo("/");
  } catch (error) {
    authError.value = getAuthErrorMessage(error, "Unable to sign out. Please try again.");
  } finally {
    isSigningOut.value = false;
  }
}

watch(() => route.query.search, (search) => {
  searchTerm.value = typeof search === "string" ? search : "";
});
watch(() => route.fullPath, () => {
  isMobileMenuOpen.value = false;
  isSearchOpen.value = false;
  closeAccountMenu();
});

function onScroll() {
  isScrolled.value = window.scrollY > 4;
}

onMounted(() => {
  watch(() => user.value?.id, () => {
    unreadCount.value = 0;
    countError.value = "";
    void refreshCount();
  }, { immediate: true });
  notificationTimer = setInterval(() => {
    if (document.visibilityState === "visible" && user.value) void refreshCount();
  }, 15000);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  onScroll();
});

onBeforeUnmount(() => {
  if (notificationTimer) clearInterval(notificationTimer);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<template>
  <header class="sticky top-0 z-50 bg-white transition-shadow duration-200" :class="isScrolled ? 'shadow-lg shadow-brand-navy/10' : 'shadow-sm shadow-brand-navy/5'">
    <div class="bg-brand-navy text-slate-300">
      <div class="mx-auto flex h-9 max-w-[1440px] items-center justify-between gap-3 px-4 text-xs sm:px-6 lg:px-8">
        <p class="inline-flex min-w-0 items-center gap-2 font-medium">
          <Globe2 class="h-3.5 w-3.5 shrink-0 text-blue-400" aria-hidden="true" />
          <span class="truncate">European Car Marketplace</span>
        </p>
        <NuxtLink to="/sell" class="inline-flex shrink-0 items-center gap-1.5 font-semibold text-slate-200 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
          Sell Your Car <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>

    <div class="border-b border-brand-border bg-white">
      <div class="mx-auto flex h-[68px] max-w-[1440px] items-center gap-2 px-4 sm:h-20 sm:gap-4 sm:px-6 lg:gap-7 lg:px-8">
        <NuxtLink to="/" aria-label="EuroCars home" class="inline-flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-navy text-white sm:h-10 sm:w-10"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
          <span class="text-lg font-extrabold tracking-tight text-brand-navy sm:text-2xl">Euro<span class="text-brand-blue">Cars</span></span>
        </NuxtLink>

        <nav aria-label="Main navigation" class="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex xl:gap-3">
          <NuxtLink v-for="item in navigation" :key="item.kind" :to="item.path"
            class="rounded-xl px-3 py-3 text-sm font-semibold transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            :class="isActive(item) ? 'bg-blue-50 text-brand-blue' : 'text-slate-600'"
            :aria-current="isActive(item) ? 'page' : undefined">{{ item.label }}</NuxtLink>
        </nav>

        <div class="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button ref="searchButton" type="button" class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue sm:h-10 sm:w-10"
            :aria-label="isSearchOpen ? 'Close search' : 'Open search'" :aria-expanded="isSearchOpen" aria-controls="header-search" @click="toggleSearch">
            <X v-if="isSearchOpen" class="h-5 w-5" aria-hidden="true" /><Search v-else class="h-5 w-5" aria-hidden="true" />
          </button>
          <NuxtLink v-if="user" to="/account/notifications"
            class="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue sm:h-10 sm:w-10"
            :aria-label="countError || (unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications')" :title="countError || 'Notifications'">
            <Bell class="h-5 w-5" aria-hidden="true" />
            <span v-if="unreadCount" class="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-[10px] font-bold text-white">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
            <span v-else-if="countError" class="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500" />
          </NuxtLink>
          <NuxtLink v-if="user" to="/account/favorites"
            class="relative hidden h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue lg:inline-flex"
            :aria-label="favoriteCars.length ? `Favorites, ${favoriteCars.length} saved cars` : 'Favorites'">
            <Heart class="h-5 w-5" aria-hidden="true" />
            <span v-if="favoriteCars.length" class="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-[10px] font-bold text-white">{{ favoriteCars.length }}</span>
          </NuxtLink>
          <NuxtLink v-if="user" to="/account/listings" class="hidden h-10 items-center rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue lg:inline-flex">My Listings</NuxtLink>

          <div v-if="user || authError" ref="accountMenuRoot" class="relative hidden lg:block">
            <button ref="accountButton" type="button" class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue"
              aria-label="Account options" aria-haspopup="true" :aria-expanded="isAccountMenuOpen" aria-controls="header-account-menu" @click="isAccountMenuOpen = !isAccountMenuOpen">
              <UserRound class="h-5 w-5" aria-hidden="true" /><span class="hidden xl:inline">Account</span><ChevronDown class="h-4 w-4" aria-hidden="true" />
            </button>
            <div v-if="isAccountMenuOpen" id="header-account-menu" class="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-brand-border bg-white p-2 shadow-xl shadow-brand-navy/10" aria-label="Account options">
              <p class="truncate px-3 py-3 text-sm font-bold text-brand-navy">{{ user ? `Welcome, ${user.name}` : "Your account" }}</p>
              <p v-if="authError" role="alert" class="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{{ authError }}</p>
              <NuxtLink v-for="item in user ? accountNavigation : []" :key="item.path" :to="item.path"
                class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue" @click="closeAccountMenu()">
                <component :is="item.icon" class="h-4 w-4" aria-hidden="true" />{{ item.label }}
              </NuxtLink>
              <button v-if="user" type="button" :disabled="isSigningOut" class="mt-1 flex w-full cursor-pointer items-center gap-3 border-t border-brand-border px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:text-red-700 focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-60" @click="signOut">
                <LogOut class="h-4 w-4" aria-hidden="true" />{{ isSigningOut ? "Signing out..." : "Sign Out" }}
              </button>
            </div>
          </div>
          <template v-else-if="isAuthReady">
            <NuxtLink to="/login" class="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue lg:inline-flex">Sign In</NuxtLink>
            <NuxtLink to="/register" class="hidden rounded-xl px-2 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue lg:inline-flex">Register</NuxtLink>
          </template>
          <NuxtLink to="/sell" class="ml-1 hidden min-h-11 items-center gap-2 rounded-xl bg-brand-blue px-4 text-sm font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:inline-flex">
            <Plus class="h-4 w-4" aria-hidden="true" /><span class="hidden xl:inline">Sell Your Car</span><span class="xl:hidden">Sell</span>
          </NuxtLink>
          <NuxtLink :to="user ? '/profile' : '/login'" :aria-label="user ? 'My profile' : 'Sign in'" class="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue sm:h-10 sm:w-10 lg:hidden">
            <UserRound class="h-5 w-5" aria-hidden="true" />
          </NuxtLink>
          <button ref="mobileMenuButton" type="button" class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-slate-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand-blue sm:h-10 sm:w-10 lg:hidden"
            :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'" :aria-expanded="isMobileMenuOpen" aria-controls="mobile-navigation"
            @click="isMobileMenuOpen = !isMobileMenuOpen; isSearchOpen = false">
            <X v-if="isMobileMenuOpen" class="h-5 w-5" aria-hidden="true" /><Menu v-else class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-if="isSearchOpen" id="header-search" class="border-t border-brand-border px-4 py-4 sm:px-6">
        <form class="mx-auto flex max-w-3xl" role="search" @submit.prevent="submitSearch">
          <label class="sr-only" for="header-car-search">Search cars</label>
          <AppInput id="header-car-search" v-model="searchTerm" type="search" placeholder="Search by brand, model or keyword"
            class="min-w-0 flex-1 rounded-r-none border-r-0 bg-slate-50" />
          <AppButton type="submit" class="w-14 rounded-l-none" aria-label="Search cars"><Search class="h-5 w-5" aria-hidden="true" /></AppButton>
        </form>
      </div>
    </div>

    <div v-if="isMobileMenuOpen" id="mobile-navigation" class="max-h-[calc(100dvh-104px)] overflow-y-auto border-b border-brand-border bg-white shadow-xl lg:hidden">
      <nav aria-label="Mobile navigation" class="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        <p class="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Marketplace</p>
        <NuxtLink v-for="item in navigation" :key="item.kind" :to="item.path" class="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue"
          :class="isActive(item) ? 'bg-blue-50 text-brand-blue' : 'text-slate-700'" :aria-current="isActive(item) ? 'page' : undefined" @click="isMobileMenuOpen = false">{{ item.label }}</NuxtLink>
        <div class="my-3 border-t border-brand-border" />
        <p class="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Your account</p>
        <p v-if="authError" role="alert" class="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{{ authError }}</p>
        <NuxtLink v-for="item in user ? accountNavigation : []" :key="item.path" :to="item.path" class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue" @click="isMobileMenuOpen = false">
          <component :is="item.icon" class="h-4 w-4" aria-hidden="true" />{{ item.label }}
        </NuxtLink>
        <template v-if="isAuthReady && !user && !authError">
          <NuxtLink to="/login" class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand-blue" @click="isMobileMenuOpen = false"><LogIn class="h-4 w-4" aria-hidden="true" />Sign In</NuxtLink>
          <NuxtLink to="/register" class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-brand-blue hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand-blue" @click="isMobileMenuOpen = false"><UserRound class="h-4 w-4" aria-hidden="true" />Register</NuxtLink>
        </template>
        <button v-else-if="user" type="button" :disabled="isSigningOut" class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-60" @click="signOut"><LogOut class="h-4 w-4" aria-hidden="true" />{{ isSigningOut ? "Signing out..." : "Sign Out" }}</button>
      </nav>
    </div>
  </header>
</template>
