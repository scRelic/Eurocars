<script setup lang="ts">
definePageMeta({ layout: "account", middleware: "auth" });

const { user, updateProfile, uploadAvatar } = useAuth();
const firstName = ref("");
const lastName = ref("");
const phone = ref("");
const countryCode = ref("");
const city = ref("");
const avatarUrl = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const isSaving = ref(false);
const isUploading = ref(false);
const uploadStatus = ref("");
const uploadProgress = ref<number | null>(null);
let uploadController: AbortController | null = null;
const selectedPhoto = ref<File | null>(null);
const previewUrl = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const populateProfile = (account: NonNullable<typeof user.value>) => {
  if (account) {
    firstName.value = account.firstName ?? "";
    lastName.value = account.lastName ?? "";
    phone.value = account.phone ?? "";
    countryCode.value = account.countryCode ?? "";
    city.value = account.city ?? "";
    avatarUrl.value = account.avatarUrl ?? "";
  }
};
const clearPhoto = () => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
  selectedPhoto.value = null;
  if (fileInput.value) fileInput.value.value = "";
};
watch(() => user.value?.id, () => {
  clearPhoto();
  if (user.value) populateProfile(user.value);
}, { immediate: true });
onBeforeUnmount(clearPhoto);

const choosePhoto = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  clearPhoto();
  errorMessage.value = "";
  statusMessage.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    errorMessage.value = "The photo must be 5 MB or smaller.";
    return;
  }
  if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    errorMessage.value = "Choose a JPEG, PNG or WebP image.";
    return;
  }
  selectedPhoto.value = file;
  previewUrl.value = URL.createObjectURL(file);
};

const savePhoto = async () => {
  if (!selectedPhoto.value || isUploading.value || isSaving.value) return;
  errorMessage.value = "";
  statusMessage.value = "";
  isUploading.value = true;
  uploadStatus.value = "Preparing";
  uploadProgress.value = null;
  uploadController = new AbortController();
  try {
    const account = await uploadAvatar(selectedPhoto.value, {
      signal: uploadController.signal,
      onStatus: (status, progress) => { uploadStatus.value = status; uploadProgress.value = progress ?? null; },
    });
    avatarUrl.value = account.avatarUrl ?? "";
    clearPhoto();
    statusMessage.value = "Profile photo updated.";
  } catch (error) {
    errorMessage.value = uploadController.signal.aborted
      ? "Photo upload cancelled."
      : getAuthErrorMessage(error, "Unable to upload your photo. Please try again.");
  } finally {
    isUploading.value = false;
    uploadController = null;
  }
};

const saveProfile = async () => {
  if (isSaving.value || isUploading.value || selectedPhoto.value) return;
  errorMessage.value = "";
  statusMessage.value = "";
  isSaving.value = true;
  try {
    const account = await updateProfile({
      firstName: firstName.value,
      lastName: lastName.value,
      phone: phone.value,
      countryCode: countryCode.value,
      city: city.value,
      avatarUrl: avatarUrl.value,
    });
    populateProfile(account);
    statusMessage.value = "Changes saved.";
  } catch (error) {
    errorMessage.value = getAuthErrorMessage(error, "Error saving changes. Please try again.");
  } finally {
    isSaving.value = false;
  }
};

useSeoMeta({ title: "Profile settings — EuroCars", description: "Manage your EuroCars profile details." });
</script>

<template>
  <div v-if="user">
    <header>
      <p class="text-sm font-semibold text-blue-600">Your account</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Profile Settings</h1>
      <p class="mt-2 text-sm leading-6 text-slate-600">Review and manage your personal information.</p>
    </header>

    <form class="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" @submit.prevent="saveProfile">
      <div class="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-6">
        <AccountAvatar :user="{ ...user, avatarUrl: previewUrl || user.avatarUrl }" />
        <div class="min-w-0 flex-1">
          <h2 class="font-bold text-slate-950">Profile photo</h2>
          <p class="mt-1 text-sm text-slate-500">JPEG, PNG or WebP, up to 5 MB.</p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <label class="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600">
              Choose photo
              <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="isUploading || isSaving" @change="choosePhoto">
            </label>
            <button v-if="selectedPhoto" type="button" class="min-h-10 cursor-pointer rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50" :disabled="isUploading || isSaving" @click="savePhoto">{{ isUploading ? `${uploadStatus}${uploadProgress === null ? '...' : ` ${Math.round(uploadProgress)}%`}` : "Save photo" }}</button>
            <button v-if="selectedPhoto" type="button" class="min-h-10 cursor-pointer px-2 text-sm font-semibold text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50" :disabled="isUploading && uploadStatus === 'Saving'" @click="isUploading ? uploadController?.abort() : clearPhoto()">Cancel</button>
          </div>
          <p v-if="selectedPhoto" class="mt-2 text-xs text-slate-500">Save or cancel the selected photo before saving other changes.</p>
        </div>
      </div>

      <h2 class="mt-7 text-lg font-bold text-slate-950">Personal details</h2>
      <p class="mt-1 text-sm text-slate-500">Keep your account details up to date.</p>

      <div class="mt-5 grid gap-5 sm:grid-cols-2">
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          First Name
          <input v-model="firstName" type="text" name="firstName" autocomplete="given-name" maxlength="100" class="auth-input" required @input="statusMessage = ''">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          Last Name
          <input v-model="lastName" type="text" name="lastName" autocomplete="family-name" maxlength="100" class="auth-input" @input="statusMessage = ''">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          Email
          <input :value="user.email" type="email" autocomplete="email" readonly class="auth-input bg-slate-50 text-slate-500">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          Phone Number
          <input v-model="phone" type="tel" autocomplete="tel" maxlength="30" placeholder="Not provided" class="auth-input" @input="statusMessage = ''">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          Country
          <input v-model="countryCode" type="text" autocomplete="country" maxlength="2" pattern="[A-Za-z]{2}" placeholder="Country code, e.g. DE" class="auth-input" @input="statusMessage = ''">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">
          City
          <input v-model="city" type="text" autocomplete="address-level2" maxlength="150" placeholder="Not provided" class="auth-input" @input="statusMessage = ''">
        </label>
        <label class="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
          Avatar URL
          <input v-model="avatarUrl" type="text" inputmode="url" maxlength="2048" placeholder="https://example.com/photo.jpg" class="auth-input" @input="statusMessage = ''">
        </label>
      </div>

      <p class="mt-5 text-xs leading-5 text-slate-500">Email changes are not supported yet. Country must be a supported two-letter country code.</p>
      <p v-if="errorMessage" role="alert" class="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{{ errorMessage }}</p>
      <p v-else-if="statusMessage" role="status" class="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">{{ statusMessage }}</p>
      <button type="submit" class="auth-submit mt-6 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-7" :disabled="isSaving || isUploading || !!selectedPhoto">
        {{ isSaving ? "Saving..." : "Save changes" }}
      </button>
    </form>
  </div>
</template>
