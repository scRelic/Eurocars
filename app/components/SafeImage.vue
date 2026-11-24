<script setup lang="ts">
const props = withDefaults(defineProps<{ src: string; alt: string; loading?: "lazy" | "eager" }>(), {
  loading: "lazy",
});
const failed = ref(false);
const element = ref<HTMLImageElement | null>(null);
watch(() => props.src, () => { failed.value = false; });
onMounted(() => {
  const image = element.value;
  if (image?.currentSrc && image.complete && !image.naturalWidth) failed.value = true;
});
</script>

<template>
  <img ref="element" :src="failed ? '/images/image-unavailable.svg' : src" :alt="alt" :loading="loading" @error="failed = true">
</template>
