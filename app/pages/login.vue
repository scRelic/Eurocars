<script setup lang="ts">
const { login } = useAuth();
const route = useRoute();
const showPassword = ref(false);
const email = ref("");
const password = ref("");
const rememberMe = ref(false);
const errorMessage = ref("");
const isSubmitting = ref(false);

const submitLogin = async () => {
  errorMessage.value = "";
  isSubmitting.value = true;

  try {
    await login(email.value, password.value, rememberMe.value);
    const redirect = route.query.redirect;
    await navigateTo(
      typeof redirect === "string" && /^\/(?:profile(?:[?#]|$)|account(?:\/|[?#]|$))/.test(redirect)
        ? redirect
        : "/profile",
    );
  } catch (error) {
    errorMessage.value = getAuthErrorMessage(error, "Unable to sign in. Please try again.");
  } finally {
    isSubmitting.value = false;
  }
};

useSeoMeta({
  title: "Sign in — EuroCars",
  description: "Sign in to your EuroCars account.",
});
</script>

<template>
  <AuthShell eyebrow="Welcome back" title="Sign in to your account" description="Sign in to save cars you like and manage your listings.">
    <form class="space-y-5" @submit.prevent="submitLogin">
      <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
        Email address
        <input v-model="email" type="email" name="email" autocomplete="email" placeholder="name@example.com" class="auth-input" required />
      </label>

      <div>
        <div class="mb-2 flex items-center justify-between gap-3">
          <label for="login-password" class="text-sm font-medium text-gray-700">Password</label>
          <NuxtLink to="/forgot-password" class="text-sm font-semibold text-blue-600 transition hover:text-blue-700"> Forgot password? </NuxtLink>
        </div>
        <div class="relative">
          <input
            id="login-password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            v-model="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            class="auth-input pr-20"
            required />
          <button
            type="button"
            class="absolute inset-y-0 right-3 my-auto h-9 cursor-pointer rounded-md px-2 text-sm font-medium text-gray-500 transition hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword">
            {{ showPassword ? "Hide" : "Show" }}
          </button>
        </div>
      </div>

      <label class="flex items-center gap-2.5 text-sm text-gray-600">
        <input v-model="rememberMe" type="checkbox" name="remember" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        Remember me
      </label>

      <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
        {{ errorMessage }}
      </p>

      <button type="submit" class="auth-submit" :disabled="isSubmitting">
        {{ isSubmitting ? "Signing in..." : "Sign in" }}
      </button>
    </form>

    <template #footer>
      Don't have an account?
      <NuxtLink to="/register" class="ml-1 font-semibold text-blue-600 transition hover:text-blue-700">Create an account</NuxtLink>
    </template>
  </AuthShell>
</template>
