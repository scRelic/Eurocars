<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; description: string }>();
</script>

<template>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{{ eyebrow }}</p>
      <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-950">{{ title }}</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{{ description }}</p>
    </div>
    <slot />
  </header>
</template>
