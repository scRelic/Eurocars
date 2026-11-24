<script setup lang="ts">
import { UserRound } from "@lucide/vue";
import type { AuthUser } from "~/../shared/types/auth";

const props = defineProps<{ user: AuthUser }>();
const failed = ref(false);
const imageElement = ref<HTMLImageElement | null>(null);
watch(() => props.user.avatarUrl, () => { failed.value = false; });
onMounted(() => {
  const image = imageElement.value;
  if (image?.currentSrc && image.complete && !image.naturalWidth) failed.value = true;
});
</script>

<template>
  <span class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-blue-700">
    <img v-if="user.avatarUrl && !failed" ref="imageElement" :src="user.avatarUrl" alt="" width="256" height="256" class="h-full w-full object-cover" @error="failed = true">
    <span v-else-if="user.firstName" class="text-xl font-bold">{{ user.firstName.charAt(0).toUpperCase() }}</span>
    <UserRound v-else class="h-6 w-6" aria-hidden="true" />
  </span>
</template>
