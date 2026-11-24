import type { Car } from "~/data/cars";

export const useFavorites = () => {
  const { user } = useAuth();
  const requestFetch = useRequestFetch();
  const items = useState<Car[]>("favorites-items", () => []);
  const loadedFor = useState<string | null>("favorites-loaded-for", () => null);
  const loading = useState("favorites-loading", () => false);
  const error = useState<string | null>("favorites-error", () => null);
  const busyIds = useState<string[]>("favorites-busy-ids", () => []);
  const generation = useState("favorites-generation", () => 0);

  const reset = () => {
    generation.value++;
    items.value = [];
    loadedFor.value = null;
    loading.value = false;
    error.value = null;
    busyIds.value = [];
  };

  const load = async () => {
    const userId = user.value?.id;
    if (!userId) return;
    const revision = ++generation.value;
    loading.value = true;
    error.value = null;
    try {
      const response = await requestFetch<{ items: Car[] }>("/api/favorites");
      if (generation.value !== revision || user.value?.id !== userId) return;
      items.value = response.items;
      loadedFor.value = userId;
    } catch (cause) {
      if (generation.value !== revision || user.value?.id !== userId) return;
      error.value = getAuthErrorMessage(cause, "Unable to load saved cars. Please try again.");
    } finally {
      if (generation.value === revision) loading.value = false;
    }
  };

  const toggle = async (carId: string) => {
    if (!user.value) throw new Error("Sign in to save cars.");
    if (!/^[1-9]\d{0,18}$/.test(carId)) throw new Error("Only marketplace listings can be saved.");
    if (loading.value || busyIds.value.includes(carId)) throw new Error("Please wait for the current request to finish.");
    if (loadedFor.value !== user.value.id) throw new Error("Saved cars could not be loaded. Please try again.");
    const userId = user.value.id;
    const revision = generation.value;
    const saved = items.value.some((car) => car.id === carId);
    busyIds.value = [...busyIds.value, carId];
    try {
      if (saved) {
        await $fetch(`/api/favorites/${carId}`, { method: "DELETE" });
        if (generation.value === revision && user.value?.id === userId) {
          items.value = items.value.filter((car) => car.id !== carId);
        }
      } else {
        const response = await $fetch<{ car: Car }>(`/api/favorites/${carId}`, { method: "POST" });
        if (generation.value === revision && user.value?.id === userId) {
          items.value = [response.car, ...items.value.filter((car) => car.id !== carId)];
        }
      }
      if (generation.value !== revision || user.value?.id !== userId) {
        throw new Error("Your session changed. Please check your saved cars.");
      }
    } finally {
      if (generation.value === revision) busyIds.value = busyIds.value.filter((id) => id !== carId);
    }
  };

  return { items, loadedFor, loading, error, busyIds, reset, load, toggle };
};
