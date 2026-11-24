<script setup lang="ts">
import { ArrowRight, BadgeCheck, CarFront, ImagePlus } from "@lucide/vue";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "Sell your car — EuroCars", description: "Create a car listing on EuroCars." });
</script>

<template>
  <section class="bg-brand-background pb-16">
    <div class="relative overflow-hidden bg-brand-navy text-white">
      <div aria-hidden="true" class="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
      <div class="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
        <NuxtLink to="/cars" class="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Marketplace <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" /> Sell a car</NuxtLink>
        <div class="mt-8 flex flex-wrap items-end justify-between gap-8">
          <div class="max-w-2xl">
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">For sellers</p>
            <h1 class="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Your car's next chapter starts here.</h1>
            <p class="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">Create a listing that gives buyers the details they need, then submit it for review.</p>
          </div>
          <div class="flex flex-wrap gap-3 text-xs font-medium text-slate-200">
            <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2"><CarFront class="h-4 w-4 text-blue-300" aria-hidden="true" />Vehicle details</span>
            <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2"><ImagePlus class="h-4 w-4 text-blue-300" aria-hidden="true" />Your photos</span>
            <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2"><BadgeCheck class="h-4 w-4 text-blue-300" aria-hidden="true" />Review & submit</span>
          </div>
        </div>
      </div>
    </div>
    <div class="relative mx-auto -mt-7 max-w-7xl px-4 sm:px-6">
      <ListingWizard />
    </div>
  </section>
</template>
