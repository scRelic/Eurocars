<script setup lang="ts">
const notice = ref("");

const submitReset = () => {
  notice.value = "Password recovery is not connected to a server yet, so no email has been sent.";
};

useSeoMeta({
  title: "Reset your password — EuroCars",
  description: "Restore access to your EuroCars account.",
});
</script>

<template>
  <AuthShell
    eyebrow="Account recovery"
    title="Forgot your password?"
    description="Enter the email address you used to register and we'll help you regain access to your account.">
    <form class="space-y-5" @submit.prevent="submitReset">
      <label class="flex flex-col gap-2 text-sm font-medium text-gray-700">
        Email address
        <input type="email" name="email" autocomplete="email" placeholder="name@example.com" class="auth-input" required />
      </label>

      <p v-if="notice" role="status" class="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-800">
        {{ notice }}
      </p>

      <button type="submit" class="auth-submit">Continue</button>
    </form>

    <template #footer>
      Remembered your password?
      <NuxtLink to="/login" class="ml-1 font-semibold text-blue-600 transition hover:text-blue-700">Back to sign in</NuxtLink>
    </template>
  </AuthShell>
</template>
