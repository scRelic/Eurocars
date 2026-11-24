<script setup lang="ts">
definePageMeta({ layout: "account", middleware: "auth" });
useSeoMeta({ title: "Favorite cars — EuroCars", description: "View your saved cars." });
</script>

<template>
  <AccountFavoritesContent />
</template>
