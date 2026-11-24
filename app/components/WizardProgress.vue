<script setup lang="ts">
import { CarFront, Check, ClipboardCheck, Images, MapPin, SlidersHorizontal } from "@lucide/vue";
import type { WizardStep } from "~/../shared/types/listing";

defineProps<{ step: WizardStep; visited: WizardStep; disabled?: boolean }>();
const emit = defineEmits<{ navigate: [step: WizardStep] }>();
const steps = [
  { title: "Vehicle details", icon: CarFront },
  { title: "Specifications", icon: SlidersHorizontal },
  { title: "Photos", icon: Images },
  { title: "Location & price", icon: MapPin },
  { title: "Review & publish", icon: ClipboardCheck },
];
</script>

<template>
  <nav aria-label="Listing progress" class="rounded-2xl border border-brand-border bg-white p-4 shadow-lg shadow-brand-navy/5 sm:p-5">
    <div class="flex items-center justify-between gap-3 text-sm sm:hidden">
      <span class="font-semibold text-slate-900">{{ steps[step - 1]?.title }}</span>
      <span class="text-slate-500">Step {{ step }} of 5</span>
    </div>
    <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:hidden" role="progressbar" :aria-valuenow="step" aria-valuemin="1" aria-valuemax="5" aria-label="Wizard progress">
      <div class="h-full rounded-full bg-blue-600 transition-all" :style="{ width: `${step * 20}%` }" />
    </div>
    <ol class="mt-4 flex gap-1 overflow-x-auto sm:mt-0 sm:grid sm:grid-cols-5 sm:gap-2">
      <li v-for="(item, index) in steps" :key="item.title" class="min-w-0">
        <button type="button" class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl p-1 text-left transition focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-default sm:w-full sm:p-2"
          :disabled="disabled || index + 1 > visited" :aria-current="index + 1 === step ? 'step' : undefined"
          @click="emit('navigate', (index + 1) as WizardStep)">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" :class="index + 1 === step ? 'bg-blue-600 text-white' : index + 1 <= visited ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'">
            <Check v-if="index + 1 < step" class="h-4 w-4" aria-hidden="true" />
            <component :is="item.icon" v-else class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="sr-only min-w-0 sm:not-sr-only sm:block"><span class="block text-xs text-slate-600">Step {{ index + 1 }}</span><span class="block text-xs font-semibold leading-4" :class="index + 1 === step ? 'text-blue-700' : 'text-slate-600'">{{ item.title }}</span></span>
        </button>
      </li>
    </ol>
  </nav>
</template>
