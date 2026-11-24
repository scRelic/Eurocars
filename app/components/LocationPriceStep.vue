<script setup lang="ts">
import { Lightbulb } from "@lucide/vue";
import type { Country, ListingFormErrors, ListingFormState } from "~/../shared/types/listing";
import { listingNumberValue } from "~/utils/listing-form";
const props = defineProps<{ form: ListingFormState; errors: ListingFormErrors; countries: Country[] }>();
const emit = defineEmits<{ update: [patch: Partial<ListingFormState>] }>();
const city = computed({ get: () => props.form.city, set: (value) => emit("update", { city: value }) });
const postalCode = computed({ get: () => props.form.postalCode, set: (value) => emit("update", { postalCode: value }) });
const description = computed({ get: () => props.form.description, set: (value) => emit("update", { description: value }) });
const countryOptions = computed(() => props.countries.map((item) => ({ label: item.name, value: item.code })));
const currencyOptions: { label: string; value: ListingFormState["currency"] }[] = [
  { label: "EUR", value: "EUR" }, { label: "GBP", value: "GBP" }, { label: "CHF", value: "CHF" },
];
</script>

<template>
  <section>
    <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Step 04 · Your offer</p>
    <h2 class="mt-2 text-2xl font-bold tracking-tight text-slate-950">Location & price</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Tell buyers where to find the car and set your asking price.</p>
    <div class="mt-7 grid gap-5 sm:grid-cols-2">
      <WizardField v-slot="{ attrs }" label="Country *" name="countryCode" :error="errors.countryCode"><AppSelect :model-value="form.countryCode" v-bind="attrs" aria-required="true" :options="countryOptions" label="Country" placeholder="Select country" @update:model-value="emit('update', { countryCode: $event })" /></WizardField>
      <WizardField v-slot="{ attrs }" label="City *" name="city" :error="errors.city"><input v-model="city" v-bind="attrs" aria-required="true" class="search-input" maxlength="150" placeholder="e.g. Berlin"></WizardField>
      <WizardField v-slot="{ attrs }" label="Postal code" name="postalCode" :error="errors.postalCode"><input v-model="postalCode" v-bind="attrs" class="search-input" maxlength="20" placeholder="Optional"></WizardField>
    </div>
    <div class="mt-8 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
      <h3 class="font-bold text-slate-950">Set your asking price</h3>
      <p class="mt-1 text-sm text-slate-500">Choose the amount and currency you want buyers to see.</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <WizardField v-slot="{ attrs }" label="Price *" name="price" :error="errors.price"><input :value="form.price ?? ''" v-bind="attrs" aria-required="true" class="search-input" type="number" min="0" max="999999999999.99" step="0.01" inputmode="decimal" placeholder="e.g. 25000" @input="emit('update', { price: listingNumberValue($event) })"></WizardField>
        <WizardField v-slot="{ attrs }" label="Currency" name="currency" :error="errors.currency"><AppSelect :model-value="form.currency" v-bind="attrs" :options="currencyOptions" label="Currency" placeholder="Select currency" @update:model-value="emit('update', { currency: $event })" /></WizardField>
      </div>
    </div>
    <div class="mt-8">
      <WizardField v-slot="{ attrs }" label="Description" name="description" :error="errors.description" hint="Optional · up to 20,000 characters">
        <textarea v-model="description" v-bind="attrs" class="search-input min-h-40 py-3" maxlength="20000" placeholder="Describe the condition, service history and anything else a buyer should know." />
      </WizardField>
      <p class="mt-3 flex gap-2 text-xs leading-5 text-slate-500"><Lightbulb class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />Mention maintenance, recent work and any known defects for a clear, honest listing.</p>
    </div>
  </section>
</template>
