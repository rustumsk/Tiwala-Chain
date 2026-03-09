"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { CheckCircle2, UserRound, Wallet } from "lucide-react";
import {
  clearStoredProfile,
  getStoredProfile,
  saveStoredProfile,
  type UserRole,
} from "@/lib/profile";
import {
  fetchCurrentUser,
  getStoredAuthSession,
  syncProfileFromBackendUser,
  updateCurrentUserProfile,
} from "@/lib/auth";

const roleOptions: Array<{ label: string; value: UserRole }> = [
  { label: "Freelancer", value: "freelancer" },
  { label: "Employer", value: "employer" },
  { label: "Both", value: "both" },
];

export default function OnboardingForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("freelancer");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;

    const authSession = getStoredAuthSession();
    if (
      !authSession ||
      authSession.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      return;
    }

    let active = true;
    fetchCurrentUser(authSession.accessToken)
      .then((user) => {
        if (!active) return;
        if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
          return;
        }

        if (!user.isApproved) {
          router.replace("/pending-approval");
          return;
        }

        if (user.role === "admin") {
          syncProfileFromBackendUser(user);
          router.replace("/admin");
          return;
        }

        if (user.displayName) {
          syncProfileFromBackendUser(user);
          router.replace(user.role === "admin" ? "/admin" : "/dashboard");
          return;
        }

        const existing = getStoredProfile();
        if (existing?.wallet?.toLowerCase() === address.toLowerCase()) {
          clearStoredProfile();
        }
      })
      .catch(() => {
        // keep user on onboarding when auth check fails
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isConnected || !address) {
      setError("Please connect your wallet first.");
      return;
    }

    const normalizedName = displayName.trim();
    if (normalizedName.length < 2) {
      setError("Display name must be at least 2 characters.");
      return;
    }

    const authSession = getStoredAuthSession();
    if (
      !authSession ||
      authSession.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      setError("Please sign in with your wallet first.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateCurrentUserProfile(authSession.accessToken, {
        displayName: normalizedName,
        role,
      });
    } catch {
      setError("Unable to save profile to the server.");
      setIsSubmitting(false);
      return;
    }

    saveStoredProfile({
      wallet: address.toLowerCase(),
      displayName: normalizedName,
      role,
      updatedAt: new Date().toISOString(),
    });

    setIsSubmitting(false);
    router.replace("/dashboard");
  };

  return (
    <section className="onboarding-form-card mx-auto w-full max-w-xl rounded-3xl border border-white/15 bg-[#100720]/75 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_24px_80px_rgba(120,70,220,0.18)] backdrop-blur-md">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
          <span>Step 1 of 1</span>
          <span>Profile Setup</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-white">
        Finish your onboarding
      </h2>
      <p className="mt-2 text-sm text-white/65">
        Set your display name and role. We will store this locally for now.
      </p>

      {isConnected && address ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs text-violet-100">
          <Wallet size={13} />
          Connected: {`${address.slice(0, 6)}...${address.slice(-4)}`}
        </div>
      ) : null}

      {!isConnected ? (
        <p className="mt-6 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Connect your wallet from the navbar to continue.
        </p>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSubmit}>
          <div>
            <label
              className="mb-2 flex items-center gap-2 text-sm font-medium text-white/85"
              htmlFor="displayName"
            >
              <UserRound size={14} className="text-violet-300" />
              Display Name
            </label>
            <input
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 text-white outline-none transition-all duration-200 placeholder:text-white/35 focus:border-violet-300/70 focus:bg-white/[0.06]"
              id="displayName"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Maria Santos"
              value={displayName}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/85">
              Role
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {roleOptions.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    className={`h-11 rounded-xl border text-sm font-medium transition-all duration-200 ${
                      selected
                        ? "border-violet-300/60 bg-violet-400/20 text-violet-100 shadow-[0_0_0_1px_rgba(196,181,253,0.2)_inset]"
                        : "border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:bg-white/[0.07]"
                    }`}
                    key={option.value}
                    onClick={() => setRole(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-300/35 bg-red-500/12 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-300/40 bg-violet-500/25 px-5 text-sm font-semibold text-violet-100 transition-all duration-200 hover:border-violet-200/70 hover:bg-violet-500/35"
            disabled={isSubmitting}
            type="submit"
          >
            <CheckCircle2 size={15} />
            {isSubmitting ? "Saving..." : "Save and continue"}
          </button>
        </form>
      )}
    </section>
  );
}
