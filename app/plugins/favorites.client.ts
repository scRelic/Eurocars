export default defineNuxtPlugin(() => {
  const { user } = useAuth();
  const favorites = useFavorites();
  watch(() => user.value?.id ?? null, (id, previousId) => {
    if (id !== previousId && previousId !== undefined) favorites.reset();
    if (id && favorites.loadedFor.value !== id) void favorites.load();
  }, { immediate: true, flush: "sync" });
});
