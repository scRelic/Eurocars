<script setup lang="ts">
import { Activity, ArrowRight, Building2, CarFront, Clock3, ShieldCheck, Users } from "@lucide/vue";
import type { AdminAnalytics, AdminDashboardData, AdminHealth } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Admin Dashboard — EuroCars", description: "EuroCars marketplace administration dashboard." });

const requestFetch = useRequestFetch();
const { data, error, status, refresh } = await useAsyncData("admin-dashboard", () => requestFetch<AdminDashboardData>("/api/admin/stats"));
const period = ref("30");
const periodOptions = ["7", "30", "90"].map((days) => ({ label: `Last ${days} days`, value: days }));
const { data: analytics, error: analyticsError, status: analyticsStatus, refresh: refreshAnalytics } = useAsyncData(
  "admin-analytics", () => requestFetch<AdminAnalytics>(`/api/admin/analytics?days=${period.value}`),
  { server: false, watch: [period] },
);
const { data: health, error: healthError, status: healthStatus, refresh: refreshHealth } = useAsyncData(
  "admin-health", async () => {
    const start = performance.now();
    const result = await requestFetch<AdminHealth>("/api/admin/health");
    return { ...result, apiDurationMs: Math.round(performance.now() - start) };
  }, { server: false },
);
const formatter = new Intl.NumberFormat("en-GB");
const percentage = (count: number, total: number) => total ? (count * 100 / total).toFixed(1) : "0.0";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const fullName = (user: AdminAnalytics["recentUsers"][number]) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
const statCards = computed(() => {
  const stats = data.value?.stats;
  if (!stats) return [];
  return [
    { label: "Total Users", value: stats.totalUsers, icon: Users, accent: "bg-blue-50 text-blue-600" },
    { label: "Total Listings", value: stats.totalListings, icon: CarFront, accent: "bg-violet-50 text-violet-600" },
    { label: "Active Listings", value: stats.activeListings, icon: Activity, accent: "bg-emerald-50 text-emerald-600" },
    { label: "Pending Listings", value: stats.pendingListings, icon: ShieldCheck, accent: "bg-amber-50 text-amber-600" },
    { label: "Verified Dealers", value: stats.verifiedDealers, icon: Building2, accent: "bg-cyan-50 text-cyan-700" },
    { label: "New Users · 30 days", value: stats.newUsers, icon: Users, accent: "bg-indigo-50 text-indigo-600" },
    { label: "New Listings · 30 days", value: stats.newListings, icon: CarFront, accent: "bg-rose-50 text-rose-600" },
  ];
});
const chartPoints = computed(() => {
  const trend = data.value?.listingTrend ?? [];
  if (!trend.length) return "";
  const max = Math.max(1, ...trend.map((item) => item.count));
  const width = 720;
  const height = 180;
  return trend
    .map((item, index) => {
      const x = trend.length === 1 ? width / 2 : (index / (trend.length - 1)) * width;
      const y = height - (item.count / max) * (height - 16) - 8;
      return `${x},${y}`;
    })
    .join(" ");
});
const chartAreaPoints = computed(() => (chartPoints.value ? `0,180 ${chartPoints.value} 720,180` : ""));
const latestTrend = computed(() => data.value?.listingTrend.slice(-1)[0]);
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

useHead({ titleTemplate: "%s" });
</script>

<template>
  <div>
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Marketplace overview</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dashboard</h1>
        <p class="mt-2 text-sm text-slate-500">A live snapshot of activity across EuroCars.</p>
      </div>
      <span
        class="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 sm:self-auto">
        <span class="h-2 w-2 rounded-full bg-emerald-500" />
        Live database metrics
      </span>
    </header>

    <div
      v-if="error"
      role="alert"
      class="mt-7 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
      <span>Unable to load dashboard data. Check the database connection and try again.</span>
      <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button>
    </div>
    <div v-else-if="status === 'pending' || !data" role="status" class="mt-7 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
      Loading dashboard data...
    </div>

    <template v-else>
      <section class="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Marketplace statistics">
        <article v-for="item in statCards" :key="item.label" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-slate-500">{{ item.label }}</p>
              <p class="mt-3 text-3xl font-bold tracking-tight text-slate-950">{{ formatter.format(item.value) }}</p>
            </div>
            <span class="flex h-11 w-11 items-center justify-center rounded-xl" :class="item.accent">
              <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        </article>
      </section>

      <div class="mt-6 grid gap-6">
        <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-slate-950">New listings</h2>
              <p class="mt-1 text-sm text-slate-500">Daily submissions over the last 30 days</p>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold text-slate-950">{{ formatter.format(data.stats.newListings) }}</p>
              <p class="text-xs text-slate-500">in the last 30 days</p>
            </div>
          </div>
          <div class="mt-6">
            <svg viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="Daily new car listings over the last 30 days" class="h-48 w-full overflow-visible">
              <defs>
                <linearGradient id="listing-trend-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#2563EB" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="#2563EB" stop-opacity="0.01" />
                </linearGradient>
              </defs>
              <line v-for="y in [20, 65, 110, 155]" :key="y" x1="0" :y1="y" x2="720" :y2="y" stroke="#E2E8F0" stroke-dasharray="4 5" />
              <polygon v-if="chartAreaPoints" :points="chartAreaPoints" fill="url(#listing-trend-fill)" />
              <polyline v-if="chartPoints" :points="chartPoints" fill="none" stroke="#2563EB" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="mt-1 flex justify-between text-[11px] font-medium text-slate-600">
              <span>{{ data.listingTrend[0] ? dateLabel(data.listingTrend[0].date) : "" }}</span>
              <span v-if="latestTrend">{{ dateLabel(latestTrend.date) }}</span>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-bold text-slate-950">Pending moderation</h2>
                <span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{{ data.stats.pendingListings }}</span>
              </div>
              <p class="mt-1 text-sm text-slate-500">Listings waiting for review</p>
            </div>
            <ShieldCheck class="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          </div>
          <div v-if="data.pendingListings.length" class="divide-y divide-slate-100">
            <article v-for="listing in data.pendingListings" :key="listing.id" class="flex gap-3 px-5 py-4">
              <SafeImage v-if="listing.imageUrl" :src="listing.imageUrl" :alt="listing.title" width="320" height="240" class="h-14 w-16 shrink-0 rounded-lg bg-slate-100 object-cover" />
              <span v-else class="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"
                ><CarFront class="h-5 w-5" aria-hidden="true"
              /></span>
              <div class="min-w-0 flex-1">
                <h3 class="truncate text-sm font-semibold text-slate-900">{{ listing.brand }} {{ listing.model }} · {{ listing.year }}</h3>
                <p class="mt-1 truncate text-xs text-slate-500">{{ listing.sellerName }} · {{ listing.city }}, {{ listing.country }}</p>
                <p class="mt-1 text-xs font-semibold text-slate-700">
                  {{ new Intl.NumberFormat("en-GB", { style: "currency", currency: listing.currency }).format(listing.price) }}
                </p>
              </div>
              <time class="hidden shrink-0 items-start gap-1 pt-0.5 text-[11px] text-slate-400 sm:flex" :datetime="listing.submittedAt">
                <Clock3 class="mt-0.5 h-3 w-3" aria-hidden="true" />
                {{ dateLabel(listing.submittedAt.slice(0, 10)) }}
              </time>
            </article>
          </div>
          <div v-else class="px-5 py-10 text-center">
            <span class="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
              ><ShieldCheck class="h-5 w-5" aria-hidden="true"
            /></span>
            <p class="mt-3 text-sm font-semibold text-slate-800">All caught up</p>
            <p class="mt-1 text-xs text-slate-500">There are no listings awaiting moderation.</p>
          </div>
          <div class="border-t border-slate-100 px-5 py-3">
            <NuxtLink to="/admin/moderation" class="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900"
              >Open moderation queue <ArrowRight class="h-3.5 w-3.5" aria-hidden="true"
            /></NuxtLink>
          </div>
        </section>
      </div>
      <div class="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div><h2 class="text-xl font-bold text-slate-950">Analytics &amp; insights</h2><p class="mt-1 text-sm text-slate-500">Marketplace activity and inventory.</p></div>
        <div class="w-44"><AppSelect v-model="period" :options="periodOptions" label="Analytics period" placeholder="Last 30 days" /></div>
      </div>
      <div v-if="analyticsError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">Unable to load analytics. <button class="font-semibold underline" @click="refreshAnalytics()">Retry</button></div>
      <div v-else-if="analyticsStatus === 'pending' || !analytics" role="status" class="mt-5 h-64 animate-pulse rounded-2xl bg-slate-200"><span class="sr-only">Loading analytics...</span></div>
      <template v-else>
        <ClientOnly>
          <AdminAnalyticsCharts :analytics="analytics" class="mt-5" />
          <template #fallback><p class="mt-5 text-sm text-slate-500">Loading charts...</p></template>
        </ClientOnly>
        <div class="mt-6 grid gap-6 lg:grid-cols-2">
          <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="text-lg font-bold text-slate-950">Top Car Brands</h2>
            <p v-if="!analytics.brands.length" class="mt-5 text-sm text-slate-500">No active listings.</p>
            <ul v-else class="mt-5 space-y-4">
              <li v-for="brand in analytics.brands" :key="brand.name"><div class="flex justify-between gap-3 text-sm"><span class="font-semibold text-slate-700">{{ brand.name }}</span><span class="text-slate-500">{{ brand.count }} · {{ percentage(brand.count, data.stats.activeListings) }}%</span></div><div class="mt-2 h-2 rounded-full bg-slate-100"><div class="h-full rounded-full bg-blue-600" :style="{ width: `${percentage(brand.count, data.stats.activeListings)}%` }" /></div></li>
            </ul>
          </section>
          <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="text-lg font-bold text-slate-950">Top Countries</h2>
            <p v-if="!analytics.countries.length" class="mt-5 text-sm text-slate-500">No active listings.</p>
            <ul v-else class="mt-5 space-y-4">
              <li v-for="country in analytics.countries" :key="country.code"><div class="flex justify-between gap-3 text-sm"><NuxtLink :to="{ path: '/cars', query: { country: country.name } }" class="font-semibold text-blue-700 hover:underline">{{ country.name }} ({{ country.code }})</NuxtLink><span class="text-slate-500">{{ country.count }} · {{ percentage(country.count, data.stats.activeListings) }}%</span></div><div class="mt-2 h-2 rounded-full bg-slate-100"><div class="h-full rounded-full bg-blue-600" :style="{ width: `${percentage(country.count, data.stats.activeListings)}%` }" /></div></li>
            </ul>
          </section>
        </div>
        <div class="mt-6 grid gap-6 lg:grid-cols-2">
          <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex justify-between gap-3"><h2 class="text-lg font-bold text-slate-950">Recent Users</h2><NuxtLink to="/admin/users" class="text-sm font-semibold text-blue-700 hover:underline">View all users</NuxtLink></div>
            <p v-if="!analytics.recentUsers.length" class="mt-5 text-sm text-slate-500">No users yet.</p>
            <ul v-else class="mt-4 divide-y divide-slate-100"><li v-for="person in analytics.recentUsers" :key="person.id" class="flex min-w-0 items-center gap-3 py-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700">{{ fullName(person).slice(0, 1).toUpperCase() }}</span><div class="min-w-0 flex-1"><NuxtLink :to="`/admin/users/${person.id}`" class="block truncate text-sm font-semibold text-blue-700 hover:underline">{{ fullName(person) }}</NuxtLink><p class="truncate text-xs text-slate-500">{{ person.email }}</p><p class="mt-1 text-xs text-slate-500">{{ person.role }} · {{ person.accountStatus }} · {{ dateTime(person.createdAt) }}</p></div></li></ul>
          </section>
          <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="text-lg font-bold text-slate-950">Recent Activity</h2>
            <p v-if="!analytics.activity.length" class="mt-5 text-sm text-slate-500">No recent activity.</p>
            <ul v-else class="mt-4 divide-y divide-slate-100"><li v-for="event in analytics.activity" :key="event.id" class="py-3"><p class="text-sm font-semibold text-slate-800">{{ event.kind }}</p><p class="break-words text-sm text-slate-600">{{ event.description }}</p><time class="text-xs text-slate-600" :datetime="event.createdAt">{{ dateTime(event.createdAt) }}</time></li></ul>
          </section>
        </div>
      </template>
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex justify-between gap-3"><h2 class="text-lg font-bold text-slate-950">System Health</h2><button class="text-sm font-semibold text-blue-700 hover:underline" :disabled="healthStatus === 'pending' || healthStatus === 'idle'" @click="refreshHealth()">Refresh</button></div>
          <p v-if="healthStatus === 'pending' || healthStatus === 'idle'" role="status" class="mt-4 text-sm text-slate-500">Checking system...</p>
          <p v-else-if="healthError || !health" role="alert" class="mt-4 text-sm text-red-700">Health check unavailable.</p>
          <dl v-else class="mt-4 space-y-3 text-sm">
            <div class="flex justify-between gap-3"><dt>Overall</dt><dd :class="health.database.status === 'Healthy' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'">{{ health.database.status === "Healthy" ? "● Healthy" : "● Degraded" }}</dd></div>
            <div class="flex justify-between gap-3"><dt>Database</dt><dd :class="health.database.status === 'Healthy' ? 'text-emerald-700' : 'text-red-700'">● {{ health.database.status }}<span v-if="health.database.durationMs !== null"> · {{ health.database.durationMs }} ms</span></dd></div>
            <div class="flex justify-between gap-3"><dt>API</dt><dd class="text-emerald-700">● Healthy · {{ health.apiDurationMs }} ms</dd></div>
            <div class="flex justify-between gap-3"><dt>Server uptime</dt><dd>{{ Math.floor(health.uptimeSeconds / 60) }} min</dd></div>
            <div class="flex justify-between gap-3"><dt>Last checked</dt><dd>{{ dateTime(health.checkedAt) }}</dd></div>
          </dl>
        </section>
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 class="text-lg font-bold text-slate-950">Alerts &amp; Attention Required</h2>
          <ul class="mt-4 space-y-3 text-sm">
            <li v-if="data.stats.pendingListings" class="rounded-lg bg-amber-50 p-3 text-amber-800"><NuxtLink to="/admin/moderation" class="font-semibold hover:underline">Warning · {{ data.stats.pendingListings }} listings pending moderation</NuxtLink></li>
            <li v-if="analytics?.pendingSales" class="rounded-lg bg-amber-50 p-3 text-amber-800"><NuxtLink to="/admin/moderation" class="font-semibold hover:underline">Warning · {{ analytics.pendingSales }} sales awaiting confirmation</NuxtLink></li>
            <li v-if="healthError || health?.database.status === 'Unavailable'" class="rounded-lg bg-red-50 p-3 text-red-800">Critical · System health check unavailable.</li>
            <li v-if="!data.stats.pendingListings && analytics && !analytics.pendingSales && health && health.database.status === 'Healthy'" class="text-slate-500">All caught up! No issues require your attention.</li>
          </ul>
        </section>
      </div>
      <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 class="text-lg font-bold text-slate-950">Quick Actions</h2><div class="mt-4 flex flex-wrap gap-3"><NuxtLink v-for="action in [{ label: 'Review Listings', path: '/admin/moderation' }, { label: 'Manage Users', path: '/admin/users' }, { label: 'Manage Dealers', path: '/admin/dealers' }, { label: 'View Audit Logs', path: '/admin/audit-logs' }]" :key="action.path" :to="action.path" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{{ action.label }}</NuxtLink></div></section>
    </template>
  </div>
</template>
