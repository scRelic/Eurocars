
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-22',

  modules: ['@nuxt/eslint'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
    },
  },

  runtimeConfig: {
    databaseUrl: '',
    sessionSecret: '',
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },
})
