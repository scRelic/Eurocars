<script setup lang="ts">
import { MessageSquare, Send, UserRound } from "@lucide/vue";
import type { ChatMessage, Conversation } from "~/../shared/types/messages";

definePageMeta({ layout: "account", middleware: "auth" });
useSeoMeta({ title: "Messages — EuroCars", description: "Your EuroCars conversations." });
const route = useRoute();
const { user } = useAuth();
const { refreshCount } = useNotifications();
const requestFetch = useRequestFetch();
const { data, error, status, refresh } = await useAsyncData(
  () => `account-conversations-${user.value?.id ?? "guest"}`,
  () => requestFetch<{ items: Conversation[] }>("/api/conversations"),
);
const selectedId = computed(() => typeof route.query.conversation === "string" && /^[1-9]\d{0,18}$/.test(route.query.conversation) ? route.query.conversation : "");
const selected = computed(() => data.value?.items.find((item) => item.id === selectedId.value));
const messages = ref<ChatMessage[]>([]);
const hasMore = ref(false);
const loading = ref(false);
const loadingOlder = ref(false);
const sending = ref(false);
const opening = ref(false);
const messageError = ref("");
const draft = ref("");
let revision = 0;
let latestLoading = false;
let disposed = false;
let timer: ReturnType<typeof setInterval> | undefined;

const openConversation = async (id: string) => {
  await navigateTo({ path: "/account/messages", query: { conversation: id } });
};

const loadLatest = async () => {
  const id = selectedId.value;
  const currentRevision = revision;
  if (!id || latestLoading) return;
  latestLoading = true;
  if (!messages.value.length) loading.value = true;
  try {
    const result = await $fetch<{ items: ChatMessage[]; hasMore: boolean }>(`/api/conversations/${id}/messages`);
    if (revision !== currentRevision) return;
    const wasEmpty = messages.value.length === 0;
    const merged = new Map(messages.value.map((message) => [message.id, message]));
    for (const message of result.items) merged.set(message.id, message);
    messages.value = [...merged.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
    if (wasEmpty) hasMore.value = result.hasMore;
    messageError.value = "";
    const last = result.items[result.items.length - 1];
    if (last) {
      await $fetch(`/api/conversations/${id}/read`, { method: "PATCH", body: { throughId: last.id } });
      await refreshCount();
      if (revision === currentRevision) await refresh();
    }
  } catch (error) {
    if (revision === currentRevision) messageError.value = getAuthErrorMessage(error, "Unable to load messages. Please try again.");
  } finally {
    latestLoading = false;
    if (revision === currentRevision) loading.value = false;
    else if (!disposed && selectedId.value) void loadLatest();
  }
};

const loadOlder = async () => {
  const id = selectedId.value;
  const first = messages.value[0];
  const currentRevision = revision;
  if (!id || !first || loadingOlder.value) return;
  loadingOlder.value = true;
  try {
    const result = await $fetch<{ items: ChatMessage[]; hasMore: boolean }>(`/api/conversations/${id}/messages`, { query: { before: first.id } });
    if (revision !== currentRevision) return;
    const known = new Set(messages.value.map((message) => message.id));
    messages.value = [...result.items.filter((message) => !known.has(message.id)), ...messages.value];
    hasMore.value = result.hasMore;
    messageError.value = "";
  } catch (error) {
    if (revision === currentRevision) messageError.value = getAuthErrorMessage(error, "Unable to load older messages.");
  } finally {
    loadingOlder.value = false;
  }
};

const sendMessage = async () => {
  const id = selectedId.value;
  const content = draft.value.trim();
  const currentRevision = revision;
  if (!id || !content || sending.value) return;
  sending.value = true;
  messageError.value = "";
  try {
    const result = await $fetch<{ message: ChatMessage }>(`/api/conversations/${id}/messages`, { method: "POST", body: { content } });
    if (revision === currentRevision) {
      messages.value = [...messages.value.filter((message) => message.id !== result.message.id), result.message];
      draft.value = "";
    }
  } catch (error) {
    if (revision === currentRevision) messageError.value = getAuthErrorMessage(error, "Unable to send your message. Please try again.");
    return;
  } finally {
    sending.value = false;
  }
  if (!disposed) await refresh();
};

watch(selectedId, () => {
  revision++;
  messages.value = [];
  draft.value = "";
  hasMore.value = false;
  loading.value = false;
  messageError.value = "";
  if (import.meta.client && selectedId.value) void loadLatest();
}, { immediate: true });

onMounted(async () => {
  await refresh();
  if (disposed) return;
  const carId = typeof route.query.carId === "string" ? route.query.carId : "";
  if (carId) {
    opening.value = true;
    try {
      const result = await $fetch<{ id: string }>("/api/conversations", { method: "POST", body: { carId } });
      if (disposed) return;
      await refresh();
      if (disposed) return;
      await openConversation(result.id);
    } catch (error) {
      messageError.value = getAuthErrorMessage(error, "Unable to start a conversation.");
    } finally {
      opening.value = false;
    }
  }
  if (disposed) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void refresh();
      void loadLatest();
    }
  }, 15000);
});
onBeforeUnmount(() => { disposed = true; revision++; if (timer) clearInterval(timer); });
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
</script>

<template>
  <div>
    <header>
      <p class="text-sm font-semibold text-blue-600">Your inbox</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Messages</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">Keep track of conversations about cars.</p>
    </header>
    <p v-if="messageError" role="alert" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{{ messageError }} <button v-if="selectedId" class="font-semibold underline" @click="loadLatest()">Retry</button></p>
    <div class="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
      <section aria-label="Conversations" class="min-w-0 border-b border-slate-100 p-4 md:border-b-0 md:border-r">
        <h2 class="px-2 py-2 font-bold text-slate-950">Conversations</h2>
        <p v-if="error" role="alert" class="p-2 text-sm text-red-700">Unable to load conversations. <button class="font-semibold underline" @click="refresh()">Retry</button></p>
        <p v-else-if="status === 'pending' || opening" role="status" class="p-2 text-sm text-slate-500">Loading conversations...</p>
        <p v-else-if="!data?.items.length" class="p-2 text-sm text-slate-500">No conversations yet. Contact a seller to start one.</p>
        <div v-else class="max-h-96 space-y-1 overflow-y-auto">
          <button v-for="conversation in data.items" :key="conversation.id" type="button" class="flex w-full cursor-pointer items-start gap-3 rounded-xl p-3 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600" :class="selectedId === conversation.id ? 'bg-blue-50' : ''" :aria-current="selectedId === conversation.id ? 'true' : undefined" @click="openConversation(conversation.id)">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600"><SafeImage v-if="conversation.otherAvatarUrl" :src="conversation.otherAvatarUrl" alt="" width="256" height="256" class="h-full w-full object-cover" /><UserRound v-else class="h-5 w-5" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1"><span class="block truncate text-sm font-bold text-slate-900">{{ conversation.otherName }}</span><span class="block truncate text-xs text-slate-500">{{ conversation.carTitle }}</span><span class="mt-1 block truncate text-xs text-slate-500">{{ conversation.lastMessage || "Start the conversation" }}</span></span>
            <span v-if="conversation.unread" class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white" :aria-label="`${conversation.unread} unread messages`">{{ conversation.unread }}</span>
          </button>
        </div>
      </section>
      <section aria-label="Conversation" class="flex min-h-96 min-w-0 flex-col">
        <template v-if="selected">
          <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600"><SafeImage v-if="selected.otherAvatarUrl" :src="selected.otherAvatarUrl" alt="" width="256" height="256" class="h-full w-full object-cover" /><UserRound v-else class="h-5 w-5" aria-hidden="true" /></span><div class="min-w-0"><h2 class="truncate font-bold text-slate-950">{{ selected.otherName }}</h2><NuxtLink v-if="selected.carStatus === 'ACTIVE'" :to="`/cars/${selected.carId}`" class="text-sm text-blue-700 hover:underline">{{ selected.carTitle }}</NuxtLink><p v-else class="text-sm text-slate-500">{{ selected.carTitle }} · Listing unavailable</p></div></header>
          <div class="max-h-[32rem] min-h-64 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
            <p v-if="loading" role="status" class="text-sm text-slate-500">Loading messages...</p>
            <button v-if="hasMore" type="button" class="block w-full text-center text-sm font-semibold text-blue-700 disabled:opacity-50" :disabled="loadingOlder" @click="loadOlder">{{ loadingOlder ? "Loading..." : "Load older messages" }}</button>
            <p v-if="!loading && !messages.length" class="py-8 text-center text-sm text-slate-500">No messages yet. Say hello!</p>
            <div v-for="message in messages" :key="message.id" class="flex" :class="message.senderId === user?.id ? 'justify-end' : 'justify-start'">
              <div class="max-w-[85%] rounded-2xl px-4 py-3 text-sm" :class="message.senderId === user?.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'"><p class="whitespace-pre-wrap break-words">{{ message.content }}</p><time class="mt-1 block text-xs opacity-70" :datetime="message.createdAt">{{ date(message.createdAt) }}</time></div>
            </div>
          </div>
          <form class="flex items-end gap-3 border-t border-slate-100 p-4" @submit.prevent="sendMessage">
            <label class="sr-only" for="chat-message">Message</label>
            <textarea id="chat-message" v-model="draft" rows="2" maxlength="4000" placeholder="Write a message..." class="min-w-0 flex-1 resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" />
            <button type="submit" :disabled="sending || !draft.trim()" :aria-label="sending ? 'Sending message' : 'Send message'" class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"><Send class="h-5 w-5" aria-hidden="true" /></button>
          </form>
        </template>
        <div v-else class="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center"><MessageSquare class="h-8 w-8 text-blue-600" aria-hidden="true" /><h2 class="mt-4 text-lg font-bold text-slate-950">Select a conversation</h2><p class="mt-2 text-sm text-slate-500">Your messages will appear here.</p></div>
      </section>
    </div>
  </div>
</template>
