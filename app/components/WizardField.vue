<script setup lang="ts">
const props = defineProps<{ label: string; name: string; error?: string; hint?: string }>();
const attrs = computed(() => ({
  id: `wizard-${props.name}`,
  "aria-invalid": props.error ? true : undefined,
  "aria-describedby": props.error ? `${props.name}-error` : props.hint ? `${props.name}-hint` : undefined,
}));
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2 text-sm font-semibold text-slate-700">
    <label :for="attrs.id">{{ label }}</label>
    <slot :attrs="attrs" />
    <span v-if="error" :id="`${name}-error`" class="text-xs font-medium text-red-700" role="alert">{{ error }}</span>
    <span v-else-if="hint" :id="`${name}-hint`" class="text-xs font-normal text-slate-500">{{ hint }}</span>
  </div>
</template>
