<script setup lang="ts">
import { Chart as ChartJS, ArcElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Doughnut, Line } from "vue-chartjs";
import type { AdminAnalytics } from "~/../shared/types/admin";

ChartJS.register(ArcElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip);
const props = defineProps<{ analytics: AdminAnalytics }>();
const labels = ["ACTIVE", "PENDING", "DRAFT", "SOLD", "REJECTED", "ARCHIVED"];
const colors = ["#10b981", "#f59e0b", "#94a3b8", "#3b82f6", "#ef4444", "#64748b"];
const statusCounts = computed(() => labels.map((label) => props.analytics.statuses.find((item) => item.status === label)?.count ?? 0));
const total = computed(() => statusCounts.value.reduce((sum, value) => sum + value, 0));
const lineData = computed(() => ({
  labels: props.analytics.trend.map((item) => item.date),
  datasets: [
    { label: "New listings", data: props.analytics.trend.map((item) => item.listings), borderColor: "#2563eb", backgroundColor: "#2563eb", tension: 0.3 },
    { label: "New users", data: props.analytics.trend.map((item) => item.users), borderColor: "#10b981", backgroundColor: "#10b981", tension: 0.3 },
  ],
}));
const donutData = computed(() => ({ labels, datasets: [{ data: statusCounts.value, backgroundColor: colors, borderWidth: 0 }] }));
const lineOptions = { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" as const }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxTicksLimit: 7 } } } };
const donutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "70%" };
</script>

<template>
  <div class="grid min-w-0 gap-6">
    <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-lg font-bold text-slate-950">Marketplace Analytics</h2>
      <p class="mt-1 text-sm text-slate-500">Daily new listings and registrations</p>
      <div v-if="analytics.trend.some(day => day.listings || day.users)" class="mt-5 h-64 sm:h-80"><Line :data="lineData" :options="lineOptions" aria-label="Daily new listings and users" /></div>
      <p v-else class="mt-5 flex h-64 items-center justify-center text-sm text-slate-500 sm:h-80">No activity for this period.</p>
      <p class="mt-4 text-xs text-slate-500">Car views by date: Unavailable. Daily view history is not recorded.</p>
    </section>
    <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-lg font-bold text-slate-950">Listings by Status</h2>
      <div v-if="total" class="mt-5 flex flex-wrap items-center justify-center gap-6">
        <div class="h-48 w-48"><Doughnut :data="donutData" :options="donutOptions" aria-label="Listings by status" /></div>
        <ul class="min-w-44 flex-1 space-y-2">
          <li v-for="(label, index) in labels" :key="label" class="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span class="flex items-center gap-2 capitalize"><span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: colors[index] }" />{{ label.toLowerCase() }}</span>
            <span>{{ statusCounts[index] }} · {{ ((statusCounts[index] ?? 0) * 100 / total).toFixed(1) }}%</span>
          </li>
        </ul>
      </div>
      <p v-else class="mt-6 text-sm text-slate-500">No listings yet.</p>
    </section>
  </div>
</template>
