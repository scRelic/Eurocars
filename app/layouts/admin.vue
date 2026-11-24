<script setup lang="ts">
import {
  Activity,
  ArrowLeft,
  Building2,
  CarFront,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "@lucide/vue";

const route = useRoute();
const { logout } = useAuth();
const mobileMenuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const signingOut = ref(false);
const signOutError = ref("");

const navigation = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "Car Listings", to: "/admin/cars", icon: CarFront },
  { label: "Moderation", to: "/admin/moderation", icon: ShieldCheck },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Dealerships", to: "/admin/dealers", icon: Building2 },
  { label: "Audit Logs", to: "/admin/audit-logs", icon: ClipboardList },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

const isActiveNavigationItem = (to: string) => to === "/admin"
  ? route.path === "/admin"
  : route.path === to || route.path.startsWith(`${to}/`);
const currentPage = computed(() => navigation.find((item) => isActiveNavigationItem(item.to))?.label ?? "Dashboard");
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && mobileMenuOpen.value) {
    mobileMenuOpen.value = false;
    menuButton.value?.focus();
  }
};
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));

const signOut = async () => {
  if (signingOut.value) return;
  signingOut.value = true;
  signOutError.value = "";
  try {
    await logout();
    await navigateTo("/");
  } catch (error) {
    console.error("Could not end the administrator session.", error);
    signOutError.value = "Unable to sign out. Please try again.";
    signingOut.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <button
      v-if="mobileMenuOpen"
      type="button"
      aria-label="Close navigation"
      class="fixed inset-0 z-40 cursor-pointer bg-slate-950/50 lg:hidden"
      @click="mobileMenuOpen = false" />
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#0F172A] text-white transition-transform duration-200 lg:translate-x-0"
      :class="mobileMenuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'"
      style="background-color: #0f172a; color: #ffffff">
      <div class="flex h-20 items-center justify-between border-b border-white/10 px-6 py-2">
        <NuxtLink to="/admin" class="flex items-center gap-3" @click="mobileMenuOpen = false">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600"><CarFront class="h-5 w-5" aria-hidden="true" /></span>
          <span>
            <span class="block text-sm font-bold tracking-wide">EuroCars</span>
            <span class="block text-[11px] font-medium text-slate-400">ADMIN CONSOLE</span>
          </span>
        </NuxtLink>
        <button
          type="button"
          aria-label="Close navigation"
          class="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden"
          @click="mobileMenuOpen = false">
          <X class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-6" aria-label="Admin navigation">
        <p class="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
        <template v-for="item in navigation" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition"
            :class="isActiveNavigationItem(item.to) ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'"
            :aria-current="isActiveNavigationItem(item.to) ? 'page' : undefined"
            @click="mobileMenuOpen = false">
            <component :is="item.icon" class="h-[18px] w-[18px]" aria-hidden="true" />
            <span class="flex-1">{{ item.label }}</span>
            <ChevronRight v-if="isActiveNavigationItem(item.to)" class="h-4 w-4" aria-hidden="true" />
          </NuxtLink>
        </template>
      </nav>

      <div class="space-y-1 border-t border-white/10 p-3">
        <NuxtLink
          to="/"
          class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          @click="mobileMenuOpen = false">
          <ArrowLeft class="h-[18px] w-[18px]" aria-hidden="true" />
          Back to Website
        </NuxtLink>
        <p v-if="signOutError" role="alert" class="rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">{{ signOutError }}</p>
        <button
          type="button"
          class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-60"
          :disabled="signingOut"
          @click="signOut">
          <LogOut class="h-[18px] w-[18px]" aria-hidden="true" />
          {{ signingOut ? "Signing out..." : "Sign Out" }}
        </button>
      </div>
    </aside>

    <div class="min-h-screen lg:pl-[280px]">
      <header class="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 py-2">
        <button
          ref="menuButton"
          type="button"
          aria-label="Open navigation"
          :aria-expanded="mobileMenuOpen"
          class="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          @click="mobileMenuOpen = true">
          <Menu class="h-5 w-5" aria-hidden="true" />
        </button>
        <div class="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span class="hidden font-medium text-slate-600 sm:inline">Admin</span>
          <ChevronRight class="hidden h-4 w-4 text-slate-300 sm:block" aria-hidden="true" />
          <span class="truncate font-semibold text-slate-800">{{ currentPage }}</span>
        </div>
        <div class="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:flex">
          <Activity class="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          Admin workspace
        </div>
      </header>
      <main class="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        <slot />
      </main>
    </div>
  </div>
</template>
