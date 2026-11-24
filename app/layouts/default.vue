<template>
  <div class="flex min-h-screen flex-col bg-brand-background">
    <LayoutAppHeader />

    <main class="flex-1">
      <slot />
    </main>

    <LayoutAppFooter />
  </div>
</template>
