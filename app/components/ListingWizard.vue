<script setup lang="ts">
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "@lucide/vue";
import type { Listing, WizardStep } from "~/../shared/types/listing";

const props = defineProps<{ initial?: Listing }>();
const {
  form, errors, step, next, back, submit, isSaving, saved, saveError, validateStep,
  lookups, lookupError, lookupStatus, refreshLookups, models, modelError, modelStatus, refreshModels, ready,
  photos, photoError, addPhotos, removePhoto, retryPhoto, setPrimaryPhoto, movePhoto, maxPhotos, maxPhotoMb, blobEnabled,
} = useCarListingForm(props.initial);
await ready;
const stepContent = ref<HTMLElement | null>(null);
const visited = ref<WizardStep>(1);
const validationMessage = ref("");
watch(step, async () => {
  if (step.value > visited.value) visited.value = step.value;
  validationMessage.value = "";
  await nextTick();
  stepContent.value?.focus();
}, { flush: "sync" });
const navigate = (target: WizardStep) => {
  if (isSaving.value || target > visited.value) return;
  for (let current = step.value; current < target; current++) {
    if (!validateStep(current as WizardStep)) {
      step.value = current as WizardStep;
      validationMessage.value = "Please check the highlighted fields before continuing.";
      return;
    }
  }
  step.value = target;
};
const submitForm = () => {
  if (step.value >= 5) return;
  const previousStep = step.value;
  next();
  if (step.value === previousStep) validationMessage.value = "Please check the highlighted fields before continuing.";
};
</script>

<template>
  <div>
    <div v-if="lookupError" role="alert" class="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
      Unable to load listing options.
      <button type="button" class="ml-2 cursor-pointer font-semibold underline" @click="refreshLookups()">Try again</button>
    </div>
    <p v-else-if="lookupStatus === 'pending' || !lookups" role="status" class="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading listing options...</p>
    <template v-else>
      <p v-if="!lookups.brands.length || !lookups.countries.length" role="alert" class="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">Brands, models and countries must be added to the database before creating a listing.</p>
      <WizardProgress :step="step" :visited="visited" :disabled="isSaving" @navigate="navigate" />
      <div class="mt-6 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form class="min-w-0 rounded-2xl border border-brand-border bg-white p-5 shadow-lg shadow-brand-navy/5 sm:p-8" novalidate @submit.prevent="submitForm">
          <div class="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <p class="text-sm font-bold text-brand-navy">{{ initial ? "Edit your listing" : "Create your listing" }}</p>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600"><LockKeyhole class="h-3.5 w-3.5" aria-hidden="true" />Not saved automatically</span>
          </div>
          <p v-if="validationMessage" role="alert" class="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{{ validationMessage }}</p>
          <div ref="stepContent" tabindex="-1" class="outline-none">
            <VehicleDetailsStep v-if="step === 1" :form="form" :errors="errors" :brands="lookups.brands" :models="models?.items ?? []" :loading-models="modelStatus === 'pending'" :model-error="!!modelError" @retry-models="refreshModels()" @update="Object.assign(form, $event)" />
            <SpecificationsStep v-else-if="step === 2" :form="form" :errors="errors" :features="lookups.features" @update="Object.assign(form, $event)" />
            <PhotosStep
              v-else-if="step === 3"
              :images="photos"
              :error="photoError"
              :max-photos="maxPhotos"
              :max-photo-mb="maxPhotoMb"
              :blob-enabled="blobEnabled"
              @add="addPhotos"
              @remove="removePhoto"
              @primary="setPrimaryPhoto"
              @move="movePhoto"
              @retry="retryPhoto"
            />
            <LocationPriceStep v-else-if="step === 4" :form="form" :errors="errors" :countries="lookups.countries" @update="Object.assign(form, $event)" />
            <ReviewStep v-else :form="form" :brands="lookups.brands" :models="models?.items ?? []" :countries="lookups.countries" :features="lookups.features" :images="photos" @edit="navigate" />
          </div>
          <p v-if="saveError" role="alert" class="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ saveError }}</p>
          <NuxtLink v-if="saved" to="/account/listings" class="mt-3 inline-block text-sm font-semibold text-blue-700 underline">Open My Listings</NuxtLink>
          <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
            <button v-if="step > 1" type="button" class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50" :disabled="isSaving" @click="back">
              <ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ step === 5 ? "Back to edit" : "Back" }}
            </button>
            <span v-else class="hidden text-xs text-slate-600 sm:inline">* Required fields</span>
            <div class="ml-auto flex flex-wrap gap-3">
              <template v-if="step === 5">
                <button type="button" class="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50" :disabled="isSaving || saved" @click="submit('DRAFT')">{{ isSaving ? "Saving..." : "Save as draft" }}</button>
                <button type="button" class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50" :disabled="isSaving || saved" @click="submit('PENDING')"><ShieldCheck class="h-4 w-4" aria-hidden="true" />{{ isSaving ? "Saving..." : "Submit for review" }}</button>
              </template>
              <button v-else type="submit" class="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Continue <ArrowRight class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
        <ListingSummary :form="form" :brands="lookups.brands" :models="models?.items ?? []" :images="photos" :step="step" />
      </div>
    </template>
  </div>
</template>
