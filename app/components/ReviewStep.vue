<script setup lang="ts">
import { CarFront, Check, MapPin, Pencil } from "@lucide/vue";
import type { Country, ListingFeature, ListingFormState, ListingImage, LookupItem, WizardStep } from "~/../shared/types/listing";
const props = defineProps<{ form: ListingFormState; brands: LookupItem[]; models: LookupItem[]; countries: Country[]; features: ListingFeature[]; images: ListingImage[] }>();
defineEmits<{ edit: [step: WizardStep] }>();
const brand = computed(() => props.brands.find((item) => item.id === props.form.brandId)?.name ?? "");
const model = computed(() => props.models.find((item) => item.id === props.form.modelId)?.name ?? "");
const country = computed(() => props.countries.find((item) => item.code === props.form.countryCode)?.name ?? "");
const image = computed(() => props.images.find((item) => item.isPrimary) ?? props.images[0]);
const selectedFeatures = computed(() => props.features.filter((item) => props.form.featureIds.includes(item.id)));
const formatLabel = (value: string) => value.toLowerCase().replaceAll("_", " ");
</script>

<template>
  <section>
    <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Step 05 · Almost there</p>
    <h2 class="mt-2 text-2xl font-bold tracking-tight text-slate-950">Review your listing</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Take a final look before saving or submitting for review.</p>
    <div class="mt-7 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div class="grid sm:grid-cols-[200px_minmax(0,1fr)]">
        <SafeImage v-if="image" :src="image.url" alt="Main listing photo" width="640" height="400" class="aspect-[16/10] h-full w-full object-cover" />
        <div v-else class="flex aspect-[16/10] items-center justify-center bg-slate-100 text-slate-400 sm:h-full"><CarFront class="h-10 w-10" aria-hidden="true" /></div>
        <div class="min-w-0 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-blue-600">Listing preview</p>
          <h3 class="mt-2 break-words text-xl font-bold text-slate-950">{{ brand }} {{ model }} {{ form.trim }}</h3>
          <p class="mt-1 break-words text-sm text-slate-500">{{ form.title }}</p>
          <p class="mt-4 text-2xl font-bold text-slate-950">{{ form.price === null ? "Price not set" : new Intl.NumberFormat("en-GB", { style: "currency", currency: form.currency }).format(form.price) }}</p>
          <p class="mt-2 flex items-center gap-1.5 text-sm text-slate-500"><MapPin class="h-4 w-4 shrink-0" aria-hidden="true" />{{ form.city }}, {{ country }}</p>
        </div>
      </div>
      <dl class="grid grid-cols-2 gap-4 border-t border-slate-100 p-5 sm:grid-cols-4">
        <div v-for="item in [{ label: 'Year', value: form.year }, { label: 'Mileage', value: form.mileage === null ? '—' : `${new Intl.NumberFormat('en-GB').format(form.mileage)} km` }, { label: 'Fuel', value: formatLabel(form.fuelType) }, { label: 'Transmission', value: formatLabel(form.transmission) }]" :key="item.label">
          <dt class="text-xs text-slate-500">{{ item.label }}</dt><dd class="mt-1 break-words text-sm font-semibold capitalize text-slate-800">{{ item.value ?? "—" }}</dd>
        </div>
      </dl>
    </div>
    <div class="mt-4 flex flex-wrap gap-2" aria-label="Edit listing sections">
      <button v-for="item in [{ step: 1 as WizardStep, label: 'Vehicle details' }, { step: 2 as WizardStep, label: 'Specifications' }, { step: 3 as WizardStep, label: 'Photos' }, { step: 4 as WizardStep, label: 'Location & price' }]" :key="item.step" type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" @click="$emit('edit', item.step)">
        <Pencil class="h-3.5 w-3.5" aria-hidden="true" /> Edit {{ item.label }}
      </button>
    </div>
    <div class="mt-7">
      <h3 class="font-bold text-slate-950">Description</h3>
      <p class="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{{ form.description || "No description provided." }}</p>
    </div>
    <div class="mt-7">
      <h3 class="font-bold text-slate-950">Features & equipment</h3>
      <div v-if="selectedFeatures.length" class="mt-3 flex flex-wrap gap-2">
        <span v-for="feature in selectedFeatures" :key="feature.id" class="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"><Check class="h-3.5 w-3.5" aria-hidden="true" />{{ feature.name }}</span>
      </div>
      <p v-else class="mt-2 text-sm text-slate-500">No features selected.</p>
    </div>
    <p class="mt-7 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">Save as draft to keep this listing unpublished, or submit it for review before it appears in the marketplace.</p>
  </section>
</template>
