"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { getStoredProfile } from "@/lib/profile";

export default function WalletRouteGate() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;

    const profile = getStoredProfile();
    if (profile?.wallet?.toLowerCase() === address.toLowerCase()) {
      router.replace("/dashboard");
      return;
    }

    router.replace("/onboarding");
  }, [address, isConnected, router]);

  return null;
}
