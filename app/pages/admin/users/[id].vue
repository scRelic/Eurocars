<script setup lang="ts">
import { ArrowLeft, Ban, MapPin, ShieldCheck, UserRoundCheck } from "@lucide/vue";
import type { AdminUser } from "~/../shared/types/admin";

definePageMeta({ layout: "admin", middleware: "admin" });
const route = useRoute();
const requestFetch = useRequestFetch();
const { data, error, status, refresh } = await useAsyncData(
  () => `admin-user-${route.params.id}`,
  () => requestFetch<{ user: AdminUser }>(`/api/admin/users/${route.params.id}`),
);
const { data: session } = await useAsyncData("admin-user-detail-session", () => requestFetch<{ user: { id: string } }>("/api/admin/access"));
const actionError = ref("");
const busy = ref(false);
const showSuspend = ref(false);
const updateStatus = async (confirmed = false) => {
  if (!data.value || busy.value || data.value.user.id === session.value?.user.id) return;
  const target = data.value.user.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  if (target === "SUSPENDED" && !confirmed) { actionError.value = ""; showSuspend.value = true; return; }
  actionError.value = "";
  busy.value = true;
  try {
    await $fetch(`/api/admin/users/${data.value.user.id}/status`, { method: "PATCH", body: { status: target } });
    await refresh();
    showSuspend.value = false;
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to update this account.");
  } finally {
    busy.value = false;
  }
};
const displayName = (user: AdminUser) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(value));
</script>

<template>
  <div>
    <ConfirmModal v-if="showSuspend && data" title="Suspend account?" :subject="data.user.email" description="Their current sessions will be revoked." confirm-label="Suspend account" :busy="busy" :error="actionError" @close="showSuspend = false; actionError = ''" @confirm="updateStatus(true)" />
    <NuxtLink to="/admin/users" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft class="h-4 w-4" aria-hidden="true" /> Back to users</NuxtLink>
    <p v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-5 text-sm text-red-700">Unable to load user profile. <button type="button" class="cursor-pointer font-semibold underline" @click="refresh()">Retry</button></p>
    <p v-else-if="status === 'pending' || !data" role="status" class="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500">Loading user profile...</p>
    <template v-else>
      <AdminPageHeading eyebrow="User profile" :title="displayName(data.user)" :description="data.user.email">
        <div class="flex flex-wrap items-center gap-3"><AdminStatusBadge :status="data.user.role" /><AdminStatusBadge :status="data.user.accountStatus" /></div>
      </AdminPageHeading>
      <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-4">
            <SafeImage v-if="data.user.avatarUrl" :src="data.user.avatarUrl" alt="" width="256" height="256" class="h-16 w-16 rounded-full object-cover" />
            <span v-else class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-700">{{ displayName(data.user).slice(0, 1).toUpperCase() }}</span>
            <div><h2 class="text-lg font-bold text-slate-950">Account details</h2><p class="text-sm text-slate-500">Member since {{ date(data.user.createdAt) }}</p></div>
          </div>
          <dl class="mt-7 grid gap-5 sm:grid-cols-2">
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Email address</dt><dd class="mt-1 break-all text-sm font-medium text-slate-800">{{ data.user.email }}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ data.user.phone || "Not provided" }}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</dt><dd class="mt-1 flex items-center gap-1 text-sm font-medium text-slate-800"><MapPin class="h-4 w-4 text-slate-400" aria-hidden="true" />{{ [data.user.city, data.user.countryCode].filter(Boolean).join(", ") || "Not provided" }}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-400">Email verification</dt><dd class="mt-1 text-sm font-medium text-slate-800">{{ data.user.emailVerifiedAt ? date(data.user.emailVerifiedAt) : "Not verified" }}</dd></div>
          </dl>
        </section>
        <aside class="space-y-5">
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p class="text-sm font-medium text-slate-500">Total listings</p><p class="mt-2 text-3xl font-bold text-slate-950">{{ data.user.listingCount }}</p><NuxtLink :to="`/admin/cars?search=${encodeURIComponent(data.user.email)}`" class="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline">Find listings by seller</NuxtLink></section>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 class="flex items-center gap-2 font-bold text-slate-950"><ShieldCheck class="h-4 w-4 text-blue-600" aria-hidden="true" />Account access</h2>
            <p class="mt-2 text-xs leading-5 text-slate-500">Suspending the account revokes active sessions. Administrator roles cannot be changed here.</p>
            <button v-if="data.user.id !== session?.user.id" type="button" class="mt-4 inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-semibold disabled:opacity-50" :class="data.user.accountStatus === 'ACTIVE' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'" :disabled="busy" @click="updateStatus()"><Ban v-if="data.user.accountStatus === 'ACTIVE'" class="h-4 w-4" aria-hidden="true" /><UserRoundCheck v-else class="h-4 w-4" aria-hidden="true" />{{ busy ? "Saving..." : data.user.accountStatus === "ACTIVE" ? "Suspend account" : "Reactivate account" }}</button>
            <p v-else class="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">You cannot suspend your own account.</p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
