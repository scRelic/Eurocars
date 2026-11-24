export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refreshUser } = useAuth();

  try {
    await refreshUser();
  } catch (error) {
    console.error("Could not verify the account session.", error);
    return abortNavigation(createError({
      statusCode: 503,
      statusMessage: "Unable to verify your account session. Please try again.",
    }));
  }

  if (!user.value) {
    return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
  }
});
