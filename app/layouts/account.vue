<template>
  <NuxtLayout name="default">
    <div class="min-h-[65vh] bg-brand-background">
      <div class="bg-brand-navy">
        <div class="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-6 sm:pb-14 lg:px-8">
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">EuroCars account</p>
          <p class="mt-2 text-sm text-slate-300">Your marketplace, all in one place.</p>
        </div>
      </div>
      <div class="relative mx-auto -mt-7 max-w-[1440px] px-4 pb-12 sm:px-6 lg:px-8">
        <div class="flex min-w-0 flex-col gap-6 md:flex-row lg:gap-8">
          <AccountSidebar />
          <div class="min-w-0 flex-1 bg-brand-background">
            <slot />
          </div>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
