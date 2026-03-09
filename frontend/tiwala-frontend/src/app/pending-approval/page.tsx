"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Clock3 } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  fetchCurrentUser,
  getStoredAuthSession,
  syncProfileFromBackendUser,
} from "@/lib/auth";
import { getStoredProfile } from "@/lib/profile";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isDarkTheme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected || !address) return;

    const session = getStoredAuthSession();
    if (!session) return;

    const interval = setInterval(async () => {
      try {
        const user = await fetchCurrentUser(session.accessToken);
        if (user.isApproved && user.role === "admin") {
          syncProfileFromBackendUser(user);
          router.replace("/admin");
        } else if (user.isApproved && user.displayName) {
          syncProfileFromBackendUser(user);
          router.replace(user.role === "admin" ? "/admin" : "/dashboard");
        } else if (user.isApproved && !user.displayName) {
          router.replace("/onboarding");
        }
      } catch {
        // ignore
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [address, isConnected, router]);

  const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";

  return (
    <div className={pageClass}>
      <section className={`mx-auto w-full max-w-xl ${panelClass} rounded-xl px-6 py-10 text-center lg:px-10`}>
        <div className={`mx-auto inline-flex size-14 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-amber-500/12" : "bg-amber-50"}`}>
          <Clock3 size={26} className="text-amber-400" />
        </div>
        <h1 className={`mt-5 text-2xl font-semibold tracking-tight ${titleClass}`}>
          Waiting for approval
        </h1>
        <p className={`mx-auto mt-3 max-w-sm text-sm leading-6 ${mutedTextClass}`}>
          Your account has been created and is pending admin approval.
          You&apos;ll be redirected automatically once an administrator approves your account.
        </p>
        {address ? (
          <p className={`mt-5 text-xs ${mutedTextClass}`}>
            Wallet: {`${address.slice(0, 6)}...${address.slice(-4)}`}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-amber-400" />
          <span className={`text-xs ${mutedTextClass}`}>Checking every few seconds...</span>
        </div>
      </section>
    </div>
  );
}
