<script setup lang="ts">
import { Settings } from "@lucide/vue";

definePageMeta({ layout: "admin", middleware: "admin" });
useSeoMeta({ title: "Settings — EuroCars Admin" });
</script>

<template>
  <div>
    <AdminPageHeading eyebrow="Administration" title="Settings" description="Marketplace settings that are currently supported by the backend." />
    <section class="mt-7 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Settings class="h-5 w-5" aria-hidden="true" /></span>
      <h2 class="mt-5 text-lg font-bold text-slate-950">No editable settings are configured</h2>
      <p class="mt-2 text-sm leading-6 text-slate-600">The current backend does not expose persistent marketplace settings. This page intentionally has no non-functional switches. Add a settings API and database model before enabling configuration here.</p>
      <div class="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Current configuration</p>
        <p class="mt-2 text-sm font-medium text-slate-800">Listing approval is managed through the moderation queue.</p>
        <p class="mt-1 text-xs leading-5 text-slate-500">New seller listings are submitted as pending and require administrator review before appearing in the public catalog.</p>
      </div>
    </section>
  </div>
</template>
