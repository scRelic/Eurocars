<script setup lang="ts">
import { ClipboardList } from "@lucide/vue";
import type { AdminAuditLog, AdminPageResult } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Audit Logs — EuroCars Admin" });

const requestFetch = useRequestFetch();
const page = ref(1);
const { data, error, refresh } = await useAsyncData(
  "admin-audit-logs",
  () => requestFetch<AdminPageResult<AdminAuditLog>>(`/api/admin/audit-logs?page=${page.value}&limit=25`),
  { watch: [page] },
);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const prettyAction = (value: string) => value.toLowerCase().replaceAll("_", " ");
</script>

<template>
  <div>
    <AdminPageHeading eyebrow="Accountability" title="Audit Logs" description="An immutable record of administrative actions across the marketplace." />
    <div class="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><ClipboardList class="h-4 w-4" aria-hidden="true" /></span><div><h2 class="text-sm font-bold text-slate-900">Administrative activity</h2><p class="text-xs text-slate-500">Logs are read-only and cannot be edited or deleted.</p></div></div>
      <p v-if="error" role="alert" class="p-8 text-center text-sm text-red-700">Unable to load audit logs. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
      <p v-else-if="!data" role="status" class="p-8 text-center text-sm text-slate-500">Loading audit logs...</p>
      <div v-else-if="data?.items.length" class="overflow-x-auto">
        <table class="w-full min-w-[800px] text-left text-sm">
          <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3">Action</th><th class="px-4 py-3">Administrator</th><th class="px-4 py-3">Entity</th><th class="px-4 py-3">Date</th><th class="px-5 py-3">Details</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="log in data.items" :key="log.id" class="align-top hover:bg-slate-50/70">
              <td class="px-5 py-4"><span class="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">{{ prettyAction(log.action) }}</span></td>
              <td class="px-4 py-4"><p class="font-medium text-slate-800">{{ log.adminName }}</p><p class="mt-1 break-all text-xs text-slate-500">{{ log.adminEmail }}</p></td>
              <td class="px-4 py-4 text-slate-600">{{ log.entityType }} #{{ log.entityId }}</td>
              <td class="whitespace-nowrap px-4 py-4"><time class="text-xs text-slate-500" :datetime="log.createdAt">{{ date(log.createdAt) }}</time></td>
              <td class="max-w-72 px-5 py-4"><details v-if="Object.keys(log.metadata ?? {}).length"><summary class="cursor-pointer text-xs font-semibold text-blue-700">View details</summary><pre class="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">{{ JSON.stringify(log.metadata, null, 2) }}</pre></details><span v-else class="text-xs text-slate-400">No additional details</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="px-5 py-16 text-center"><ClipboardList class="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p class="mt-3 text-sm font-semibold text-slate-700">No audit entries yet</p><p class="mt-1 text-xs text-slate-500">Administrative activity will appear here as it occurs.</p></div>
      <AdminPagination v-if="data" :page="data.page" :total-pages="data.totalPages" :total="data.total" :limit="data.limit" @page="page = $event" />
    </div>
  </div>
</template>
