<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "@lucide/vue";

const props = defineProps<{ page: number; totalPages: number; total: number; limit: number }>();
const emit = defineEmits<{ page: [value: number] }>();
const firstItem = computed(() => props.total === 0 ? 0 : (props.page - 1) * props.limit + 1);
const lastItem = computed(() => Math.min(props.page * props.limit, props.total));
</script>

<template>
  <div class="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <p class="text-xs font-medium text-slate-500">Showing {{ firstItem }}–{{ lastItem }} of {{ total }} results</p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page <= 1"
        @click="emit('page', page - 1)"
      >
        <ChevronLeft class="h-4 w-4" aria-hidden="true" /> Previous
      </button>
      <span class="min-w-16 text-center text-xs font-semibold text-slate-600">Page {{ page }} of {{ Math.max(1, totalPages) }}</span>
      <button
        type="button"
        class="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page >= totalPages"
        @click="emit('page', page + 1)"
      >
        Next <ChevronRight class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
