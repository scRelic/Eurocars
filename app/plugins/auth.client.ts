export default defineNuxtPlugin((nuxtApp) => {
  const { refreshUser, isAuthReady } = useAuth();

  nuxtApp.hook("app:mounted", async () => {
    try {
      if (!isAuthReady.value) {
        await refreshUser();
      }
    } catch (error) {
      console.error("Could not restore the EuroCars account session.", error);
    }
  });
});
