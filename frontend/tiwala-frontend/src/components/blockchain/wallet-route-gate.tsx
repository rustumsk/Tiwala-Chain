"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import {
  clearAuthSession,
  fetchCurrentUser,
  getStoredAuthSession,
  syncProfileFromBackendUser,
} from "@/lib/auth";

export default function WalletRouteGate() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;

    const session = getStoredAuthSession();
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

        if (user.displayName) {
          syncProfileFromBackendUser(user);
          router.replace("/dashboard");
          return;
        }

        router.replace("/onboarding");
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, router]);

  return null;
}
