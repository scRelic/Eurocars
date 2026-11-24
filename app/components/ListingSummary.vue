<script setup lang="ts">
import { CarFront, Lightbulb, ShieldCheck } from "@lucide/vue";
import type { ListingFormState, ListingImage, LookupItem, WizardStep } from "~/../shared/types/listing";
const props = defineProps<{ form: ListingFormState; brands: LookupItem[]; models: LookupItem[]; images: ListingImage[]; step: WizardStep }>();
const brand = computed(() => props.brands.find((item) => item.id === props.form.brandId)?.name);
const model = computed(() => props.models.find((item) => item.id === props.form.modelId)?.name);
const image = computed(() => props.images.find((item) => item.isPrimary) ?? props.images[0]);
const tips = [
  "A specific title helps buyers understand your vehicle at a glance.",
  "Accurate specifications make it easier for buyers to compare cars.",
  "Add clear photos from different angles and choose your main photo.",
  "Include service history and known defects in your description.",
  "Review your details before submitting. Approval is required.",
];
</script>

<template>
  <aside class="space-y-4 lg:sticky lg:top-32 lg:self-start">
    <div class="rounded-2xl border border-brand-border bg-white p-5 shadow-sm shadow-brand-navy/5">
      <div class="flex items-center justify-between gap-3"><h2 class="font-bold text-slate-950">Your progress</h2><span class="text-sm font-bold text-blue-600">{{ step }} / 5</span></div>
      <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-blue-600 transition-all" :style="{ width: `${step * 20}%` }" /></div>
      <p class="mt-2 text-xs leading-5 text-slate-500">Step {{ step }} of 5 · Changes are saved only when you choose a save option.</p>
    </div>
    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <SafeImage v-if="image" :src="image.url" alt="Listing photo" width="640" height="360" class="aspect-[16/9] w-full object-cover" />
      <div v-else class="flex aspect-[16/9] items-center justify-center bg-slate-100 text-slate-400"><CarFront class="h-10 w-10" aria-hidden="true" /></div>
      <div class="p-5">
        <p class="text-xs font-semibold uppercase tracking-widest text-blue-600">Your listing</p>
        <h2 class="mt-2 break-words font-bold text-slate-950">{{ [brand, model, form.trim].filter(Boolean).join(" ") || "Your vehicle" }}</h2>
        <p class="mt-1 break-words text-sm text-slate-500">{{ form.title || "Add details to see a summary" }}</p>
        <p v-if="form.price !== null" class="mt-3 text-lg font-bold text-slate-950">{{ new Intl.NumberFormat("en-GB", { style: "currency", currency: form.currency }).format(form.price) }}</p>
        <p v-if="form.year || form.mileage !== null" class="mt-2 text-xs text-slate-500">{{ [form.year, form.mileage === null ? null : `${new Intl.NumberFormat("en-GB").format(form.mileage)} km`].filter((value) => value !== null).join(" · ") }}</p>
      </div>
    </div>
    <div class="rounded-2xl border border-blue-100 bg-blue-50 p-5">
      <p class="flex items-center gap-2 text-sm font-bold text-blue-900"><Lightbulb class="h-4 w-4" aria-hidden="true" />Seller tip</p>
      <p class="mt-2 text-sm leading-6 text-blue-800">{{ tips[step - 1] }}</p>
      <p class="mt-4 flex items-center gap-2 border-t border-blue-100 pt-4 text-xs text-blue-700"><ShieldCheck class="h-4 w-4" aria-hidden="true" />Listings require review before publication.</p>
    </div>
  </aside>
</template>
