<script setup lang="ts">
useSeoMeta({
  title: "Your favorites — EuroCars",
  description: "View the cars you've saved on EuroCars.",
});
</script>

<template>
  <section class="bg-slate-50 py-12 sm:py-16">
    <div class="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
      <AccountFavoritesContent />
    </div>
  </section>
</template>
