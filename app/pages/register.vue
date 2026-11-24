<script setup lang="ts">
const { register } = useAuth();
const showPassword = ref(false);
const showConfirmation = ref(false);
const firstName = ref("");
const lastName = ref("");
const email = ref("");
const password = ref("");
const confirmation = ref("");
const errorMessage = ref("");
const isSubmitting = ref(false);

const submitRegistration = async () => {
  if (password.value !== confirmation.value) {
    errorMessage.value = "Passwords do not match. Please check both fields.";
    return;
  }

  errorMessage.value = "";
  isSubmitting.value = true;

  try {
    await register(firstName.value, lastName.value, email.value, password.value);
    await navigateTo("/profile");
  } catch (error) {
    errorMessage.value = getAuthErrorMessage(error, "Unable to create your account. Please try again.");
  } finally {
    isSubmitting.value = false;
  }
};

useSeoMeta({
  title: "Create an account — EuroCars",
  description: "Create your EuroCars account.",
});
</script>

<template>
  <AuthShell eyebrow="Join EuroCars" title="Create an account" description="Save cars to your favourites and publish your own listings.">
    <form class="space-y-4" @submit.prevent="submitRegistration">
      <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
        First name
        <input v-model="firstName" type="text" name="firstName" autocomplete="given-name" placeholder="Your first name" maxlength="100" class="auth-input" required />
      </label>

      <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
        Last name (optional)
        <input v-model="lastName" type="text" name="lastName" autocomplete="family-name" placeholder="Your last name" maxlength="100" class="auth-input" />
      </label>

      <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
        Email address
        <input v-model="email" type="email" name="email" autocomplete="email" placeholder="name@example.com" maxlength="255" class="auth-input" required />
      </label>

      <div>
        <label for="register-password" class="mb-2 block text-sm font-medium text-gray-700">Password</label>
        <div class="relative">
          <input
            id="register-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="new-password"
            minlength="8"
            placeholder="At least 8 characters"
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

      <div>
        <label for="register-confirmation" class="mb-2 block text-sm font-medium text-gray-700">Confirm password</label>
        <div class="relative">
          <input
            id="register-confirmation"
            v-model="confirmation"
            :type="showConfirmation ? 'text' : 'password'"
            name="passwordConfirmation"
            autocomplete="new-password"
            minlength="8"
            placeholder="Enter your password again"
            class="auth-input pr-20"
            required />
          <button
            type="button"
            class="absolute inset-y-0 right-3 my-auto h-9 cursor-pointer rounded-md px-2 text-sm font-medium text-gray-500 transition hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600"
            :aria-label="showConfirmation ? 'Hide password' : 'Show password'"
            @click="showConfirmation = !showConfirmation">
            {{ showConfirmation ? "Hide" : "Show" }}
          </button>
        </div>
      </div>

      <label class="flex items-start gap-2.5 pt-1 text-sm leading-5 text-gray-600">
        <input type="checkbox" name="terms" class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500" required />
        <span>I agree to the Terms of Service and Privacy Policy.</span>
      </label>

      <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
        {{ errorMessage }}
      </p>

      <button type="submit" class="auth-submit" :disabled="isSubmitting">
        {{ isSubmitting ? "Creating account..." : "Create account" }}
      </button>
    </form>

    <template #footer>
      Already have an account?
      <NuxtLink to="/login" class="ml-1 font-semibold text-blue-600 transition hover:text-blue-700">Sign in</NuxtLink>
    </template>
  </AuthShell>
</template>
