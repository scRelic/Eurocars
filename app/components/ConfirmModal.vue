<script setup lang="ts">
import { X } from "@lucide/vue";

const props = defineProps<{
  title: string;
  subject: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const dialog = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const titleId = useId();
const descriptionId = useId();
let previousFocus: HTMLElement | null = null;

const close = () => { if (!props.busy) emit("close"); };
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "Tab") {
    const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
};
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  cancelButton.value?.focus();
});
onBeforeUnmount(() => {
  void nextTick(() => {
    if (previousFocus?.isConnected) previousFocus.focus();
    else {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
  });
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm" @click.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId" class="w-full max-w-md rounded-2xl border border-brand-border bg-brand-surface p-6 shadow-2xl shadow-brand-navy/20" @keydown="onKeydown">
        <div class="flex items-start justify-between gap-4">
          <h2 :id="titleId" class="text-xl font-bold text-slate-950">{{ title }}</h2>
          <button type="button" aria-label="Close dialog" :disabled="busy" class="cursor-pointer rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50" @click="close"><X class="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <p class="mt-4 break-words font-semibold text-slate-800">{{ subject }}</p>
        <p :id="descriptionId" class="mt-2 text-sm leading-6 text-slate-600">{{ description }}</p>
        <p v-if="error" role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button ref="cancelButton" type="button" :disabled="busy" class="min-h-11 cursor-pointer rounded-xl border border-brand-border px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50" @click="close">Cancel</button>
          <button type="button" :disabled="busy" class="min-h-11 cursor-pointer rounded-xl bg-brand-danger px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-danger disabled:cursor-not-allowed disabled:opacity-50" @click="emit('confirm')">{{ busy ? "Saving..." : confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
