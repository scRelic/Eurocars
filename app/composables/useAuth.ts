import type { AuthUser, ProfileUpdate } from "~/../shared/types/auth";
import { cancelImageUpload, uploadImageToBlob } from "./uploadImageToBlob";

type AuthResponse = {
  user: AuthUser;
};

const apiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return fallback;
  }

  const data = error.data;
  if (typeof data === "object" && data !== null && "statusMessage" in data && typeof data.statusMessage === "string") {
    return data.statusMessage;
  }
  return fallback;
};

export const getAuthErrorMessage = apiErrorMessage;

export const useAuth = () => {
  const user = useState<AuthUser | null>("eurocars-auth-user", () => null);
  const isAuthReady = useState("eurocars-auth-ready", () => false);
  const authError = useState<string | null>("eurocars-auth-error", () => null);
  const authRevision = useState("eurocars-auth-revision", () => 0);
  const requestFetch = useRequestFetch();

  const refreshUser = async () => {
    const revision = authRevision.value;
    try {
      const response = await requestFetch<{ user: AuthUser | null }>("/api/auth/me");
      if (revision !== authRevision.value) {
        return user.value;
      }
      user.value = response.user;
      authError.value = null;
      isAuthReady.value = true;
      return response.user;
    } catch (error) {
      if (revision !== authRevision.value) {
        return user.value;
      }
      authError.value = apiErrorMessage(error, "Unable to verify your account session. Please try again.");
      isAuthReady.value = true;
      throw error;
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean) => {
    const response = await $fetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password, rememberMe },
    });
    authRevision.value += 1;
    user.value = response.user;
    authError.value = null;
    isAuthReady.value = true;
    return response.user;
  };

  const register = async (firstName: string, lastName: string, email: string, password: string) => {
    const response = await $fetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: { firstName, lastName, email, password },
    });
    authRevision.value += 1;
    user.value = response.user;
    authError.value = null;
    isAuthReady.value = true;
    return response.user;
  };

  const updateProfile = async (profile: ProfileUpdate) => {
    const response = await $fetch<AuthResponse>("/api/users/me", {
      method: "PATCH",
      body: profile,
    });
    authRevision.value += 1;
    user.value = response.user;
    authError.value = null;
    return response.user;
  };

  const uploadAvatar = async (
    photo: File,
    options?: { signal?: AbortSignal; onStatus?: (status: string, progress?: number) => void },
  ) => {
    const revision = authRevision.value;
    const userId = user.value?.id;
    const config = await $fetch<{ avatarBlobEnabled: boolean }>("/api/uploads/config", { signal: options?.signal });
    let response: AuthResponse;
    if (config.avatarBlobEnabled) {
      let uploadId: string | undefined;
      try {
        uploadId = await uploadImageToBlob(photo, "AVATAR", options);
        options?.onStatus?.("Saving");
        response = await $fetch<AuthResponse>("/api/users/me/avatar/complete", {
          method: "POST", body: { id: uploadId }, signal: options?.signal, retry: 1,
        });
      } catch (error) {
        if (uploadId) await cancelImageUpload(uploadId);
        throw error;
      }
    } else {
      options?.onStatus?.("Saving");
      const form = new FormData();
      form.append("photo", photo);
      response = await $fetch<AuthResponse>("/api/users/me/avatar", { method: "POST", body: form, signal: options?.signal });
    }
    if (revision !== authRevision.value || user.value?.id !== userId) {
      throw new Error("Your session changed. Please sign in again.");
    }
    authRevision.value += 1;
    user.value = response.user;
    authError.value = null;
    return response.user;
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await $fetch("/api/users/me/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  };

  const logout = async () => {
    await $fetch("/api/auth/logout", { method: "POST" });
    authRevision.value += 1;
    user.value = null;
    authError.value = null;
    isAuthReady.value = true;
  };

  return { user, isAuthReady, authError, refreshUser, login, register, updateProfile, uploadAvatar, changePassword, logout };
};
