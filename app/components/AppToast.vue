<script setup lang="ts">
const props = defineProps<{ message: string; kind?: "success" | "error" }>();
const emit = defineEmits<{ close: [] }>();
let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.message, (message) => {
  if (timer) clearTimeout(timer);
  if (message) timer = setTimeout(() => emit("close"), 6000);
}, { immediate: true });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>

<template>
  <Teleport to="body">
    <div v-if="message" :role="kind === 'error' ? 'alert' : 'status'" class="fixed bottom-4 right-4 z-[110] flex max-w-[calc(100vw-2rem)] items-start gap-4 rounded-2xl border bg-brand-surface p-4 text-sm shadow-xl shadow-brand-navy/10" :class="kind === 'error' ? 'border-red-200 text-red-800' : 'border-emerald-200 text-emerald-800'">
      <span>{{ message }}</span>
      <button type="button" aria-label="Dismiss notification" class="cursor-pointer rounded font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue" @click="emit('close')">×</button>
    </div>
  </Teleport>
</template>
