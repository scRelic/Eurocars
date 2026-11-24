export default defineNuxtPlugin(async () => {
  const { user } = useAuth();
  if (user.value) await useFavorites().load();
});
