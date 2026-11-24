<script setup lang="ts">
import { Ban, Search, UserRound, UserRoundCheck } from "@lucide/vue";
import type { AdminPageResult, AdminUser } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Users — EuroCars Admin" });

const requestFetch = useRequestFetch();
const searchInput = ref("");
const search = ref("");
const statusFilter = ref("");
const roleFilter = ref("");
const page = ref(1);
const actionError = ref("");
const busyId = ref("");
const suspendUser = ref<AdminUser | null>(null);
const { data: session } = await useAsyncData("admin-users-session", () => requestFetch<{ user: { id: string } }>("/api/admin/access"));
const statusOptions = [
  { label: "All account statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];
const roleOptions = [
  { label: "All roles", value: "" },
  { label: "User", value: "USER" },
  { label: "Admin", value: "ADMIN" },
];
let timer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { search.value = value.trim(); page.value = 1; }, 250);
});
watch([statusFilter, roleFilter], () => { page.value = 1; });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), limit: "20", sort: "newest" });
  if (search.value) params.set("search", search.value);
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (roleFilter.value) params.set("role", roleFilter.value);
  return params.toString();
});
const { data, error, refresh } = await useAsyncData(
  "admin-users", () => requestFetch<AdminPageResult<AdminUser>>(`/api/admin/users?${query.value}`), { watch: [query] },
);
const updateStatus = async (user: AdminUser, confirmed = false) => {
  if (busyId.value || user.id === session.value?.user.id) return;
  const statusToSet = user.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  if (statusToSet === "SUSPENDED" && !confirmed) { actionError.value = ""; suspendUser.value = user; return; }
  actionError.value = "";
  busyId.value = user.id;
  try {
    await $fetch(`/api/admin/users/${user.id}/status`, { method: "PATCH", body: { status: statusToSet } });
    await refresh();
    suspendUser.value = null;
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to update this account.");
  } finally {
    busyId.value = "";
  }
};
const displayName = (user: AdminUser) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
</script>

<template>
  <div>
    <ConfirmModal v-if="suspendUser" title="Suspend account?" :subject="suspendUser.email" description="Their current sessions will be revoked." confirm-label="Suspend account" :busy="busyId !== ''" :error="actionError" @close="suspendUser = null; actionError = ''" @confirm="updateStatus(suspendUser, true)" />
    <AdminPageHeading eyebrow="Account administration" title="Users" description="Review user accounts, listing activity and account access." />
    <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <section class="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[minmax(220px,1fr)_180px_160px]">
        <label class="relative"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input v-model="searchInput" type="search" aria-label="Search users" class="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Search name or email"></label>
        <AppSelect v-model="statusFilter" :options="statusOptions" label="Account status" placeholder="All account statuses" />
        <AppSelect v-model="roleFilter" :options="roleOptions" label="User role" placeholder="All roles" />
      </div>
      <p v-if="error" role="alert" class="p-8 text-center text-sm text-red-700">Could not load users. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
      <p v-if="!error && !data" role="status" class="p-8 text-center text-sm text-slate-500">Loading users...</p>
      <div v-if="data?.items.length" class="overflow-x-auto">
        <table class="w-full min-w-[790px] text-left text-sm">
          <thead class="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3">User</th><th class="px-4 py-3">Role</th><th class="px-4 py-3">Account</th><th class="px-4 py-3">Listings</th><th class="px-4 py-3">Registered</th><th class="px-5 py-3 text-right">Access</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="user in data.items" :key="user.id" class="hover:bg-slate-50/70">
              <td class="px-5 py-4"><div class="flex items-center gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600"><SafeImage v-if="user.avatarUrl" :src="user.avatarUrl" alt="" width="256" height="256" class="h-full w-full object-cover" /><UserRound v-else class="h-5 w-5" aria-hidden="true" /></span><div><NuxtLink :to="`/admin/users/${user.id}`" class="font-semibold text-blue-700 hover:underline">{{ displayName(user) }}</NuxtLink><p class="mt-1 text-xs text-slate-500">{{ user.email }}</p></div></div></td>
              <td class="px-4 py-4"><AdminStatusBadge :status="user.role" /></td>
              <td class="px-4 py-4"><AdminStatusBadge :status="user.accountStatus" /></td>
              <td class="px-4 py-4 font-medium text-slate-700">{{ user.listingCount }}</td>
              <td class="px-4 py-4 text-slate-600">{{ date(user.createdAt) }}</td>
              <td class="px-5 py-4 text-right"><button v-if="user.id !== session?.user.id" type="button" class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-50" :class="user.accountStatus === 'ACTIVE' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'" :disabled="busyId !== ''" @click="updateStatus(user)"><Ban v-if="user.accountStatus === 'ACTIVE'" class="h-3.5 w-3.5" aria-hidden="true" /><UserRoundCheck v-else class="h-3.5 w-3.5" aria-hidden="true" />{{ busyId === user.id ? "Saving..." : user.accountStatus === "ACTIVE" ? "Suspend" : "Reactivate" }}</button><span v-else class="text-xs text-slate-600">Current account</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="data && data.items.length === 0" class="p-12 text-center text-sm text-slate-500">No users match these filters.</div>
      <AdminPagination v-if="data" :page="data.page" :total-pages="data.totalPages" :total="data.total" :limit="data.limit" @page="page = $event" />
    </section>
  </div>
</template>
