export default defineNuxtPlugin(async () => {
  const { refreshUser } = useAuth();
  try {
    await refreshUser();
  } catch {
    console.error("Could not restore the EuroCars account session.");
  }
});
