<script setup lang="ts">
import { Check } from "@lucide/vue";
import type { FuelType, ListingFeature, ListingFormErrors, ListingFormState, Transmission } from "~/../shared/types/listing";
import { listingNumberValue } from "~/utils/listing-form";

const props = defineProps<{ form: ListingFormState; errors: ListingFormErrors; features: ListingFeature[] }>();
const emit = defineEmits<{ update: [patch: Partial<ListingFormState>] }>();
const exteriorColor = computed({ get: () => props.form.exteriorColor, set: (value) => emit("update", { exteriorColor: value }) });
const interiorColor = computed({ get: () => props.form.interiorColor, set: (value) => emit("update", { interiorColor: value }) });
const featureIds = computed({ get: () => props.form.featureIds, set: (value) => emit("update", { featureIds: value }) });
const fuelTypes: FuelType[] = ["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "PLUGIN_HYBRID", "LPG", "CNG", "HYDROGEN", "OTHER"];
const transmissions: Transmission[] = ["MANUAL", "AUTOMATIC"];
const label = (value: string) => ["LPG", "CNG"].includes(value) ? value : value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
const fuelOptions = fuelTypes.map((value) => ({ label: label(value), value }));
const transmissionOptions = transmissions.map((value) => ({ label: label(value), value }));
const dateValue = (event: Event) => (event.target as HTMLInputElement).value || null;
const categories = computed(() => {
  const order = ["comfort", "technology", "safety", "parking", "exterior", "interior"];
  const groups = new Map<string, ListingFeature[]>();
  for (const feature of props.features) {
    const items = groups.get(feature.category) ?? [];
    items.push(feature);
    groups.set(feature.category, items);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ai = order.indexOf(a.toLowerCase());
    const bi = order.indexOf(b.toLowerCase());
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.localeCompare(b);
  });
});
</script>

<template>
  <section>
    <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Step 02 · The details</p>
    <h2 class="mt-2 text-2xl font-bold tracking-tight text-slate-950">Specifications & equipment</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Give buyers a complete picture of your vehicle.</p>
    <div class="mt-7 grid gap-5 sm:grid-cols-2">
      <WizardField v-slot="{ attrs }" label="Mileage (km) *" name="mileage" :error="errors.mileage"><input :value="form.mileage ?? ''" v-bind="attrs" aria-required="true" class="search-input" type="number" min="0" max="2147483647" step="1" inputmode="numeric" placeholder="e.g. 45000" @input="emit('update', { mileage: listingNumberValue($event) })"></WizardField>
      <WizardField v-slot="{ attrs }" label="Fuel type" name="fuelType" :error="errors.fuelType"><AppSelect :model-value="form.fuelType" v-bind="attrs" :options="fuelOptions" label="Fuel type" placeholder="Select fuel type" @update:model-value="emit('update', { fuelType: $event })" /></WizardField>
      <WizardField v-slot="{ attrs }" label="Transmission" name="transmission" :error="errors.transmission"><AppSelect :model-value="form.transmission" v-bind="attrs" :options="transmissionOptions" label="Transmission" placeholder="Select transmission" @update:model-value="emit('update', { transmission: $event })" /></WizardField>
      <WizardField v-slot="{ attrs }" label="Engine capacity (cc)" name="engineCapacityCc" :error="errors.engineCapacityCc"><input :value="form.engineCapacityCc ?? ''" v-bind="attrs" class="search-input" type="number" min="1" max="2147483647" step="1" placeholder="Optional" @input="emit('update', { engineCapacityCc: listingNumberValue($event) })"></WizardField>
      <WizardField v-slot="{ attrs }" label="Power (hp)" name="powerHp" :error="errors.powerHp"><input :value="form.powerHp ?? ''" v-bind="attrs" class="search-input" type="number" min="1" max="2147483647" step="1" placeholder="Optional" @input="emit('update', { powerHp: listingNumberValue($event) })"></WizardField>
      <WizardField v-slot="{ attrs }" label="Exterior color" name="exteriorColor" :error="errors.exteriorColor"><input v-model="exteriorColor" v-bind="attrs" class="search-input" maxlength="50" placeholder="Optional"></WizardField>
      <WizardField v-slot="{ attrs }" label="Interior color" name="interiorColor" :error="errors.interiorColor"><input v-model="interiorColor" v-bind="attrs" class="search-input" maxlength="50" placeholder="Optional"></WizardField>
      <WizardField v-slot="{ attrs }" label="Doors" name="doors" :error="errors.doors"><input :value="form.doors ?? ''" v-bind="attrs" class="search-input" type="number" min="1" max="8" step="1" placeholder="Optional" @input="emit('update', { doors: listingNumberValue($event) })"></WizardField>
      <WizardField v-slot="{ attrs }" label="Seats" name="seats" :error="errors.seats"><input :value="form.seats ?? ''" v-bind="attrs" class="search-input" type="number" min="1" max="20" step="1" placeholder="Optional" @input="emit('update', { seats: listingNumberValue($event) })"></WizardField>
      <WizardField v-slot="{ attrs }" label="First registration" name="firstRegistration" :error="errors.firstRegistration"><input :value="form.firstRegistration ?? ''" v-bind="attrs" class="search-input" type="date" min="0001-01-01" max="9999-12-31" @input="emit('update', { firstRegistration: dateValue($event) })"></WizardField>
    </div>
    <div class="mt-9 border-t border-slate-100 pt-7">
      <h3 class="text-lg font-bold text-slate-950">Features & equipment</h3>
      <p class="mt-1 text-sm text-slate-500">Select the features included with your car.</p>
      <p v-if="errors.featureIds" role="alert" class="mt-3 text-sm text-red-700">{{ errors.featureIds }}</p>
      <p v-if="!features.length" class="mt-4 text-sm text-slate-500">No equipment options are available yet.</p>
      <fieldset v-for="[category, items] in categories" :key="category" class="mt-6">
        <legend class="text-sm font-bold text-slate-700">{{ category }}</legend>
        <div class="mt-3 flex flex-wrap gap-2">
          <label v-for="feature in items" :key="feature.id" class="cursor-pointer">
            <input v-model="featureIds" type="checkbox" :value="feature.id" class="peer sr-only">
            <span class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-300 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600">
              <Check v-if="form.featureIds.includes(feature.id)" class="h-4 w-4" aria-hidden="true" />{{ feature.name }}
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  </section>
</template>
