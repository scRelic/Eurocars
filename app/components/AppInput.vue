<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const value = defineModel<string>({ required: true });
</script>

<template>
  <input v-bind="$attrs" v-model="value" class="search-input">
</template>
