<script setup lang="ts">
import type { Country, LookupItem } from "~/../shared/types/listing";
import type { CarFilters } from "~/data/cars";

const filters = defineModel<CarFilters>("filters", { required: true });
const props = withDefaults(defineProps<{ brands: LookupItem[]; countries: Country[]; sidebar?: boolean }>(), { sidebar: false });

const emit = defineEmits<{
  search: [];
}>();

const models = ref<LookupItem[]>([]);
const modelError = ref("");
const priceError = ref("");
const loadingModels = ref(false);
let modelRequest = 0;
const brandOptions = computed(() => [{ label: "Any brand", value: "" }, ...props.brands.map((brand) => ({ label: brand.name, value: brand.name }))]);
const countryOptions = computed(() => [{ label: "All Europe", value: "" }, ...props.countries.map((country) => ({ label: country.name, value: country.name }))]);
const modelOptions = computed(() => [{ label: "Any model", value: "" }, ...models.value.map((model) => ({ label: model.name, value: model.name }))]);

const updateFilter = <Key extends keyof CarFilters>(key: Key, value: CarFilters[Key]) => {
  filters.value = { ...filters.value, [key]: value };
};

const updateBrand = (brand: string) => {
  filters.value = { ...filters.value, brand, model: "" };
};

const loadModels = async (brandName: string) => {
  const request = ++modelRequest;
  const brand = props.brands.find((item) => item.name === brandName);
  models.value = [];
  modelError.value = "";
  loadingModels.value = false;
  if (!brand) return;
  loadingModels.value = true;
  try {
    const result = await $fetch<{ items: LookupItem[] }>(`/api/brands/${brand.id}/models`);
    if (request === modelRequest) models.value = result.items;
  } catch {
    if (request === modelRequest) modelError.value = "Unable to load models. Please try again.";
  } finally {
    if (request === modelRequest) loadingModels.value = false;
  }
};

watch(() => filters.value.brand, (brand) => { void loadModels(brand); });
watch(() => [filters.value.minPrice, filters.value.maxPrice], () => { priceError.value = ""; });
onMounted(() => {
  void loadModels(filters.value.brand);
});

const submit = () => {
  const { minPrice, maxPrice } = filters.value;
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    priceError.value = "Minimum price cannot exceed maximum price.";
    return;
  }
  priceError.value = "";
  emit("search");
};

const updatePrice = (key: "minPrice" | "maxPrice", event: Event) => {
  const rawValue = (event.target as HTMLInputElement).value;
  const value = rawValue === "" ? null : Number(rawValue);
  if (value === null || Number.isFinite(value)) {
    updateFilter(key, value);
  }
};
</script>

<template>
  <form class="grid gap-4" :class="sidebar ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-6'" @submit.prevent="submit">
    <p v-if="priceError" role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700" :class="sidebar ? '' : 'sm:col-span-2 lg:col-span-6'">{{ priceError }}</p>
    <div class="flex flex-col gap-2 text-sm font-medium text-gray-700">
      Brand
      <AppSelect :model-value="filters.brand" :options="brandOptions" placeholder="Any brand" label="Brand" @update:model-value="updateBrand" />
    </div>

    <div class="flex flex-col gap-2 text-sm font-medium text-gray-700">
      Model
      <AppSelect
        :model-value="filters.model"
        :options="modelOptions"
        :placeholder="loadingModels ? 'Loading models...' : 'Any model'"
        label="Model"
        :disabled="loadingModels || !!modelError"
        @update:model-value="updateFilter('model', $event)" />
      <span v-if="modelError" role="alert" class="text-xs text-red-700 sm:col-span-2 lg:col-span-6">
        {{ modelError }}
        <button type="button" class="cursor-pointer font-semibold underline" @click="loadModels(filters.brand)">Retry</button>
      </span>
    </div>

    <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
      Price from, €
      <input
        type="number"
        min="0"
        step="any"
        placeholder="Any"
        :value="filters.minPrice ?? ''"
        class="search-input"
        @input="updatePrice('minPrice', $event)" />
    </label>

    <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
      Price to, €
      <input
        type="number"
        min="0"
        step="any"
        placeholder="Any"
        :value="filters.maxPrice ?? ''"
        class="search-input"
        @input="updatePrice('maxPrice', $event)" />
    </label>

    <div class="flex flex-col gap-2 text-sm font-medium text-gray-700">
      Country
      <AppSelect
        :model-value="filters.country"
        :options="countryOptions"
        placeholder="All Europe"
        label="Country"
        @update:model-value="updateFilter('country', $event)" />
    </div>

    <button
      type="submit"
      class="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 cursor-pointer px-5 py-3 font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <span>{{ sidebar ? "Apply filters" : "Search Cars" }}</span>
      <span aria-hidden="true">→</span>
    </button>
  </form>
</template>
