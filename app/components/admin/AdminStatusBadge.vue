<script setup lang="ts">
const props = defineProps<{ status: string }>();

const style = computed(() => {
  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    VERIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
    DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
    SOLD: "bg-blue-50 text-blue-700 ring-blue-600/20",
    REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
    SUSPENDED: "bg-red-50 text-red-700 ring-red-600/20",
    ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-500/20",
    ADMIN: "bg-violet-50 text-violet-700 ring-violet-600/20",
    USER: "bg-slate-100 text-slate-600 ring-slate-500/20",
    UNVERIFIED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  };
  return styles[props.status] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
});
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset" :class="style">
    {{ status.toLowerCase() }}
  </span>
</template>
