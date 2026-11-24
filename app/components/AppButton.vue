<script setup lang="ts">
withDefaults(defineProps<{ variant?: "primary" | "secondary" | "danger"; type?: "button" | "submit" | "reset" }>(), {
  variant: "primary",
  type: "button",
});
</script>

<template>
  <button
    :type="type"
    class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-60"
    :class="variant === 'primary' ? 'bg-brand-blue text-white hover:bg-brand-blue-hover' : variant === 'danger' ? 'bg-brand-danger text-white hover:bg-red-700' : 'border border-brand-border bg-white text-slate-700 hover:bg-slate-50'">
    <slot />
  </button>
</template>
