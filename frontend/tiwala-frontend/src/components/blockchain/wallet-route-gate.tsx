"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";
import { clearStoredProfile } from "@/lib/profile";
import {
  AUTH_UPDATED_EVENT,
  clearAuthSession,
  fetchCurrentUser,
  getAuthStorageRaw,
  getStoredAuthSession,
  isAuthFailure,
  syncProfileFromBackendUser,
} from "@/lib/auth";

export default function WalletRouteGate() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const authSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(AUTH_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(AUTH_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getAuthStorageRaw,
    () => null
  );

  const session = useMemo(() => {
    if (!authSnapshot) return null;
    return getStoredAuthSession();
  }, [authSnapshot]);

  useEffect(() => {
    if (!isConnected || !address) return;

    if (
      !session ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      clearAuthSession();
      return;
    }

    let active = true;
    fetchCurrentUser(session.accessToken)
      .then((user) => {
        if (!active) return;
        if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
          clearAuthSession();
          return;
        }

        if (user.role === "admin") {
          syncProfileFromBackendUser(user);
          router.replace("/admin");
          return;
        }

        if (!user.displayName) {
          clearStoredProfile();
          router.replace("/onboarding");
          return;
        }

        if (!user.isApproved) {
          syncProfileFromBackendUser(user);
          router.replace("/pending-approval");
          return;
        }

        if (user.displayName) {
          syncProfileFromBackendUser(user);
          return;
        }
      })
      .catch((error) => {
        if (!active) return;
        if (isAuthFailure(error)) {
          clearAuthSession();
        }
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, router, session]);

  return null;
}
