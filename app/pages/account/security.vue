<script setup lang="ts">
import { KeyRound, Monitor, ShieldCheck } from "@lucide/vue";

definePageMeta({ layout: "account", middleware: "auth" });
const { changePassword } = useAuth();
const currentPassword = ref("");
const newPassword = ref("");
const confirmation = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const isSaving = ref(false);

const submitPassword = async () => {
  errorMessage.value = "";
  statusMessage.value = "";
  if (newPassword.value !== confirmation.value) {
    errorMessage.value = "Passwords do not match.";
    return;
  }
  isSaving.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    confirmation.value = "";
    statusMessage.value = "Your password has been changed. Other sessions have been signed out.";
  } catch (error) {
    errorMessage.value = getAuthErrorMessage(error, "Unable to change your password. Please try again.");
  } finally {
    isSaving.value = false;
  }
};

useSeoMeta({ title: "Security — EuroCars", description: "Your account security settings." });
</script>

<template>
  <div>
    <header>
      <p class="text-sm font-semibold text-blue-600">Your account</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Security</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">Manage how you access your account.</p>
    </header>
    <div class="mt-7 grid gap-5">
      <section class="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><KeyRound class="h-5 w-5" aria-hidden="true" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold text-slate-950">Change Password</h2>
          <p class="mt-2 text-sm leading-6 text-slate-600">Enter your current password to set a new one.</p>
          <form class="mt-5 max-w-lg space-y-4" @submit.prevent="submitPassword">
            <label class="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Current password
              <input v-model="currentPassword" type="password" autocomplete="current-password" maxlength="128" class="auth-input" required>
            </label>
            <label class="flex flex-col gap-2 text-sm font-medium text-slate-700">
              New password
              <input v-model="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="auth-input" required>
            </label>
            <label class="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Confirm new password
              <input v-model="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="auth-input" required>
            </label>
            <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMessage }}</p>
            <p v-else-if="statusMessage" role="status" class="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{{ statusMessage }}</p>
            <button type="submit" class="auth-submit cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" :disabled="isSaving">
              {{ isSaving ? "Saving..." : "Change password" }}
            </button>
          </form>
        </div>
      </section>
      <section class="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ShieldCheck class="h-5 w-5" aria-hidden="true" /></span>
        <div><h2 class="text-lg font-bold text-slate-950">Account Security</h2><p class="mt-2 text-sm leading-6 text-slate-600">You can sign out of your current session using the account menu.</p></div>
      </section>
      <section class="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Monitor class="h-5 w-5" aria-hidden="true" /></span>
        <div><h2 class="text-lg font-bold text-slate-950">Active Sessions</h2><p class="mt-2 text-sm leading-6 text-slate-600">Viewing or managing other sessions is not available yet.</p></div>
      </section>
    </div>
  </div>
</template>
