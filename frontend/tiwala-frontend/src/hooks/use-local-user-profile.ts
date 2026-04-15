"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getProfileStorageRaw,
  PROFILE_UPDATED_EVENT,
  type LocalUserProfile,
} from "@/lib/profile";

/**
 * Profile from localStorage, re-rendering when `PROFILE_UPDATED_EVENT` fires
 * (same pattern as RouteShell — avoids stale role after `syncProfileFromBackendUser`).
 */
export function useLocalUserProfile(address: string | undefined): LocalUserProfile | null {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(PROFILE_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(PROFILE_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getProfileStorageRaw,
    () => null
  );

  return useMemo(() => {
    if (!address || !snapshot) return null;
    try {
      const parsed = JSON.parse(snapshot) as LocalUserProfile;
      return parsed.wallet.toLowerCase() === address.toLowerCase() ? parsed : null;
    } catch {
      return null;
    }
  }, [address, snapshot]);
}
