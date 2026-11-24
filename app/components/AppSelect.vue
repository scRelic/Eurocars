<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type SelectOption = {
  label: string;
  value: T;
};

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  options: SelectOption[];
  placeholder: string;
  label: string;
  id?: string;
  disabled?: boolean;
}>();

const value = defineModel<T>({ required: true });

const root = ref<HTMLDivElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const listbox = ref<HTMLDivElement | null>(null);
const isOpen = ref(false);
const activeIndex = ref(0);
const generatedId = useId();
const selectedLabel = computed(() => props.options.find((option) => option.value === value.value)?.label ?? props.placeholder);

const openMenu = (direction: 1 | -1 = 1) => {
  if (props.disabled || !props.options.length) {
    return;
  }

  const selectedIndex = props.options.findIndex((option) => option.value === value.value);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : direction === 1 ? 0 : props.options.length - 1;
  isOpen.value = true;
};

const closeMenu = () => {
  isOpen.value = false;
};

const selectOption = (option: SelectOption) => {
  value.value = option.value;
  closeMenu();
  trigger.value?.focus();
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Tab") {
    closeMenu();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;

    if (!isOpen.value) {
      openMenu(direction);
    } else {
      activeIndex.value = (activeIndex.value + direction + props.options.length) % props.options.length;
    }
    return;
  }

  if (event.key === "Escape" && isOpen.value) {
    event.preventDefault();
    closeMenu();
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (isOpen.value) {
      const option = props.options[activeIndex.value];
      if (option) {
        selectOption(option);
      }
    } else {
      openMenu();
    }
  }
};

const onDocumentPointerDown = (event: PointerEvent) => {
  if (event.target instanceof Node && !root.value?.contains(event.target)) {
    closeMenu();
  }
};

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu();
  },
);
watch(
  () => props.options,
  (options) => {
    if (!options.length) closeMenu();
    else if (activeIndex.value >= options.length) activeIndex.value = options.length - 1;
  },
);
watch([activeIndex, isOpen], async () => {
  if (!isOpen.value) return;
  await nextTick();
  const menu = listbox.value;
  const option = menu?.children.item(activeIndex.value);
  if (!(menu && option instanceof HTMLElement)) return;
  if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
  else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
    menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }
});

onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<template>
  <div ref="root" class="relative w-full">
    <button
      v-bind="$attrs"
      :id="props.id ?? `${generatedId}-trigger`"
      ref="trigger"
      type="button"
      role="combobox"
      aria-autocomplete="none"
      :aria-label="label"
      :aria-expanded="isOpen"
      :aria-controls="`${generatedId}-listbox`"
      :aria-activedescendant="isOpen ? `${generatedId}-option-${activeIndex}` : undefined"
      :disabled="disabled"
      class="search-input flex cursor-pointer items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      @click="isOpen ? closeMenu() : openMenu()"
      @keydown="onKeydown">
      <span class="truncate">{{ selectedLabel }}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0 text-gray-500 transition-transform" :class="{ 'rotate-180': isOpen }">
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div
      v-if="isOpen"
      :id="`${generatedId}-listbox`"
      ref="listbox"
      role="listbox"
      :aria-label="label"
      class="absolute left-0 top-full z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface p-1.5 shadow-xl shadow-slate-900/10">
      <div
        v-for="(option, index) in options"
        :id="`${generatedId}-option-${index}`"
        :key="option.value"
        role="option"
        :aria-selected="option.value === value"
        class="flex min-h-10 cursor-pointer items-center rounded-lg px-3 py-2 text-sm transition-colors"
        :class="activeIndex === index ? 'bg-brand-blue font-medium text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'"
        @mouseenter="activeIndex = index"
        @click="selectOption(option)">
        {{ option.label }}
      </div>
    </div>
  </div>
</template>
