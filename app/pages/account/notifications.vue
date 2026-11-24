<script setup lang="ts">
import { Bell } from "@lucide/vue";
import type { Notification } from "~/../shared/types/notifications";

definePageMeta({ layout: "account", middleware: "auth" });
useSeoMeta({ title: "Notifications — EuroCars", description: "Your marketplace notifications." });

const { user } = useAuth();
const { unreadCount, refreshCount } = useNotifications();
const requestFetch = useRequestFetch();
const page = ref(1);
const { data, error, status, refresh } = await useAsyncData(
  () => `notifications-${user.value?.id ?? "guest"}-${page.value}`,
  () => requestFetch<{ items: Notification[]; hasMore: boolean }>("/api/notifications", { query: { page: page.value } }),
);
const actionError = ref("");
const busy = ref(false);

const markAllRead = async () => {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    await $fetch("/api/notifications/read", { method: "PATCH" });
    await Promise.all([refresh(), refreshCount()]);
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to mark notifications as read.");
  } finally {
    busy.value = false;
  }
};

const openNotification = async (item: Notification) => {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    if (!item.readAt) {
      await $fetch(`/api/notifications/${item.id}/read`, { method: "PATCH" });
      await refreshCount();
    }
    await navigateTo(item.type === "NEW_MESSAGE" && item.conversationId
      ? { path: "/account/messages", query: { conversation: item.conversationId } }
      : "/account/listings");
  } catch (error) {
    actionError.value = getAuthErrorMessage(error, "Unable to open the notification.");
  } finally {
    busy.value = false;
  }
};

const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
</script>

<template>
  <div>
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold text-blue-600">Stay up to date</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Notifications</h1>
        <p class="mt-2 text-sm text-slate-600">Updates about your listings and messages.</p>
      </div>
      <button v-if="unreadCount" type="button" :disabled="busy" class="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" @click="markAllRead">Mark all as read</button>
    </header>
    <p v-if="actionError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ actionError }}</p>
    <div v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
      {{ getAuthErrorMessage(error, "Unable to load notifications.") }}
      <button type="button" class="ml-2 cursor-pointer font-semibold underline" @click="refresh()">Try again</button>
    </div>
    <p v-else-if="status === 'pending'" class="mt-6 text-sm text-slate-600">Loading notifications...</p>
    <div v-else-if="data?.items.length" class="mt-6 space-y-3">
      <button v-for="item in data.items" :key="item.id" type="button" :disabled="busy" class="flex w-full cursor-pointer items-start gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50" :class="item.readAt ? 'border-slate-200' : 'border-blue-200 bg-blue-50/40'" @click="openNotification(item)">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Bell class="h-5 w-5" aria-hidden="true" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold text-slate-950">
            {{ item.type === "LISTING_APPROVED" ? "Your listing was approved" : item.type === "LISTING_REJECTED" ? "Your listing was rejected" : item.type === "SALE_CONFIRMED" ? "Your sale was confirmed" : item.type === "SALE_REJECTED" ? "Your sale was not confirmed" : "You received a new message" }}
          </span>
          <span class="mt-1 block text-sm text-slate-600">{{ item.carTitle }}</span>
          <span v-if="item.reason" class="mt-1 block text-sm text-red-700">Reason: {{ item.reason }}</span>
          <span class="mt-2 block text-xs text-slate-500">{{ date(item.createdAt) }}</span>
        </span>
        <span v-if="!item.readAt" class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
      </button>
      <div class="flex justify-between gap-3 pt-3">
        <button type="button" :disabled="page === 1" class="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" @click="page--">Previous</button>
        <span class="py-2 text-sm text-slate-600">Page {{ page }}</span>
        <button type="button" :disabled="!data.hasMore" class="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" @click="page++">Next</button>
      </div>
    </div>
    <div v-else class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
      <Bell class="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
      <h2 class="mt-4 text-lg font-bold text-slate-950">No notifications yet</h2>
      <p class="mt-2 text-sm text-slate-500">Your listing and message updates will appear here.</p>
    </div>
  </div>
</template>
