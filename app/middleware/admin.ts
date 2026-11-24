const errorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null) return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;
  if ("response" in error && typeof error.response === "object" && error.response !== null
    && "status" in error.response && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
};

export default defineNuxtRouteMiddleware(async (to) => {
  try {
    await useRequestFetch()("/api/admin/access");
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
    }
    if (status === 403) {
      return navigateTo("/");
    }
    console.error("Could not verify administrator access.", error);
    return abortNavigation(createError({
      statusCode: 503,
      statusMessage: "Unable to verify administrator access. Please try again.",
    }));
  }
});
