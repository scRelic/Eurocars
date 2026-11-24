<script setup lang="ts">
import type { BodyType, CarCondition, ListingFormErrors, ListingFormState, LookupItem } from "~/../shared/types/listing";
import { listingNumberValue } from "~/utils/listing-form";

const props = defineProps<{ form: ListingFormState; errors: ListingFormErrors; brands: LookupItem[]; models: LookupItem[]; loadingModels: boolean; modelError: boolean }>();
const emit = defineEmits<{ retryModels: []; update: [patch: Partial<ListingFormState>] }>();
const bodyTypes: BodyType[] = ["SEDAN", "SUV", "HATCHBACK", "WAGON", "COUPE", "CONVERTIBLE", "VAN", "PICKUP", "OTHER"];
const conditions: CarCondition[] = ["NEW", "USED", "DAMAGED"];
const label = (value: string) => value === "SUV" ? value : value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
const brandOptions = computed(() => props.brands.map((item) => ({ label: item.name, value: item.id })));
const modelOptions = computed(() => props.models.map((item) => ({ label: item.name, value: item.id })));
const conditionOptions = conditions.map((value) => ({ label: label(value), value }));
const bodyOptions: { label: string; value: BodyType | "" }[] = [
  { label: "Not specified", value: "" },
  ...bodyTypes.map((value) => ({ label: label(value), value })),
];
const bodyType = computed<BodyType | "">({
  get: () => props.form.bodyType ?? "",
  set: (value) => emit("update", { bodyType: value || null }),
});
const trim = computed({ get: () => props.form.trim, set: (value) => emit("update", { trim: value }) });
const title = computed({ get: () => props.form.title, set: (value) => emit("update", { title: value }) });
</script>

<template>
  <section>
    <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Step 01 · The basics</p>
    <h2 class="mt-2 text-2xl font-bold tracking-tight text-slate-950">Tell us about your car</h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">Start with the details that help buyers find the right vehicle.</p>
    <div class="mt-7 grid gap-5 sm:grid-cols-2">
      <WizardField v-slot="{ attrs }" label="Brand *" name="brandId" :error="errors.brandId">
        <AppSelect :model-value="form.brandId" v-bind="attrs" aria-required="true" :options="brandOptions" label="Brand" placeholder="Select brand" @update:model-value="emit('update', { brandId: $event })" />
      </WizardField>
      <div>
        <WizardField v-slot="{ attrs }" label="Model *" name="modelId" :error="errors.modelId">
          <AppSelect :model-value="form.modelId" v-bind="attrs" aria-required="true" :options="modelOptions" label="Model" :placeholder="loadingModels ? 'Loading models...' : 'Select model'" :disabled="!form.brandId || loadingModels || modelError" @update:model-value="emit('update', { modelId: $event })" />
        </WizardField>
        <p v-if="modelError" role="alert" class="mt-2 text-xs text-red-700">Unable to load models. <button type="button" class="cursor-pointer underline" @click="$emit('retryModels')">Retry</button></p>
        <p v-else-if="form.brandId && !loadingModels && !models.length" class="mt-2 text-xs text-slate-500">No models are available for this brand.</p>
      </div>
      <WizardField v-slot="{ attrs }" label="Trim" name="trim" :error="errors.trim" hint="Optional, for example M Sport.">
        <input v-model="trim" v-bind="attrs" maxlength="255" class="search-input" placeholder="e.g. M Sport">
      </WizardField>
      <WizardField v-slot="{ attrs }" label="Year *" name="year" :error="errors.year">
        <input :value="form.year ?? ''" v-bind="attrs" aria-required="true" type="number" min="1886" max="2100" step="1" inputmode="numeric" class="search-input" placeholder="e.g. 2022" @input="emit('update', { year: listingNumberValue($event) })">
      </WizardField>
      <WizardField v-slot="{ attrs }" label="Listing title *" name="title" :error="errors.title" class="sm:col-span-2" hint="A clear title helps your listing stand out.">
        <input v-model="title" v-bind="attrs" aria-required="true" maxlength="255" class="search-input" placeholder="e.g. BMW 3 Series in excellent condition">
      </WizardField>
      <WizardField v-slot="{ attrs }" label="Condition" name="condition" :error="errors.condition">
        <AppSelect :model-value="form.condition" v-bind="attrs" :options="conditionOptions" label="Condition" placeholder="Select condition" @update:model-value="emit('update', { condition: $event })" />
      </WizardField>
      <WizardField v-slot="{ attrs }" label="Body type" name="bodyType" :error="errors.bodyType">
        <AppSelect v-model="bodyType" v-bind="attrs" :options="bodyOptions" label="Body type" placeholder="Not specified" />
      </WizardField>
    </div>
  </section>
</template>
