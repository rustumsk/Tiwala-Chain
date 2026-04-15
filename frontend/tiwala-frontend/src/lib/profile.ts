export type UserRole = "freelancer" | "employer" | "both" | "admin";

export type LocalUserProfile = {
  wallet: string;
  displayName: string;
  role: UserRole;
  updatedAt: string;
};

const PROFILE_STORAGE_KEY = "tiwala:user-profile";
export const PROFILE_UPDATED_EVENT = "tiwala:profile-updated";

/** Raw JSON from localStorage; for `useSyncExternalStore` subscribers. */
export function getProfileStorageRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PROFILE_STORAGE_KEY);
}

export function getStoredProfile(): LocalUserProfile | null {
  const raw = getProfileStorageRaw();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LocalUserProfile;
  } catch {
    return null;
  }
}

export function saveStoredProfile(profile: LocalUserProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

export function clearStoredProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}
