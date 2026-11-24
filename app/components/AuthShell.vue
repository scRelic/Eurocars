<script setup lang="ts">
import { ArrowRight, CarFront, Globe2, Heart, MessageSquare } from "@lucide/vue";
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="bg-brand-background px-4 py-10 sm:px-6 sm:py-14">
    <div class="mx-auto grid max-w-6xl overflow-hidden rounded-3xl border border-brand-border bg-white shadow-xl shadow-brand-navy/5 lg:grid-cols-2">
      <section class="px-6 py-8 sm:px-12 sm:py-12">
        <div class="mx-auto max-w-md">
          <NuxtLink to="/" class="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white"><CarFront class="h-5 w-5" aria-hidden="true" /></span><span class="text-xl font-extrabold tracking-tight text-brand-navy">Euro<span class="text-brand-blue">Cars</span></span></NuxtLink>
          <div class="mt-9"><p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-blue">{{ eyebrow }}</p><h1 class="mt-3 text-3xl font-bold tracking-tight text-brand-navy">{{ title }}</h1><p class="mt-3 text-sm leading-6 text-slate-600">{{ description }}</p></div>
          <div class="mt-8"><slot /></div>
          <div v-if="$slots.footer" class="mt-7 border-t border-brand-border pt-6 text-center text-sm text-slate-600"><slot name="footer" /></div>
        </div>
      </section>
      <aside class="relative hidden min-h-[560px] overflow-hidden bg-brand-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" class="absolute -right-28 -top-32 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div aria-hidden="true" class="absolute -bottom-36 -left-24 h-96 w-96 rounded-full border border-white/10 bg-blue-500/10" />
        <div class="relative"><p class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-300"><Globe2 class="h-4 w-4" aria-hidden="true" />The European car marketplace</p><h2 class="mt-8 max-w-sm text-4xl font-bold leading-tight tracking-tight">Your next journey starts here.</h2><p class="mt-5 max-w-sm text-sm leading-7 text-slate-300">Explore cars across Europe, keep your favourites close and connect with sellers.</p>
          <div class="mt-10 space-y-4 text-sm text-slate-200"><p class="flex items-center gap-3"><Heart class="h-4 w-4 text-blue-300" aria-hidden="true" />Save cars to revisit later</p><p class="flex items-center gap-3"><MessageSquare class="h-4 w-4 text-blue-300" aria-hidden="true" />Connect directly with sellers</p><p class="flex items-center gap-3"><CarFront class="h-4 w-4 text-blue-300" aria-hidden="true" />Manage your listings in one place</p></div>
        </div>
        <NuxtLink to="/cars" class="relative mt-12 inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Explore cars <ArrowRight class="h-4 w-4" aria-hidden="true" /></NuxtLink>
      </aside>
    </div>
  </div>
</template>
