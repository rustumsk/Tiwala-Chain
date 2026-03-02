"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  getStoredProfile,
  saveStoredProfile,
  type UserRole,
} from "@/lib/profile";

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

  useEffect(() => {
    if (!isConnected || !address) return;

    const existing = getStoredProfile();
    if (existing?.wallet?.toLowerCase() === address.toLowerCase()) {
      router.replace("/dashboard");
      return;
    }
  }, [address, isConnected, router]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    saveStoredProfile({
      wallet: address.toLowerCase(),
      displayName: normalizedName,
      role,
      updatedAt: new Date().toISOString(),
    });

    router.replace("/dashboard");
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
      <h1 className="text-2xl font-semibold text-slate-100">
        Finish your onboarding
      </h1>
      <p className="mt-2 text-sm text-slate-300">
        Set your display name and role. We will store this locally for now.
      </p>

      {!isConnected ? (
        <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Connect your wallet from the navbar to continue.
        </p>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSubmit}>
          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-200"
              htmlFor="displayName"
            >
              Display Name
            </label>
            <input
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-slate-100 outline-none transition focus:border-teal-300"
              id="displayName"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Maria Santos"
              value={displayName}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Role
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {roleOptions.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    className={`h-11 rounded-xl border text-sm font-medium transition ${
                      selected
                        ? "border-teal-300 bg-teal-400/15 text-teal-200"
                        : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
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
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300/60 hover:bg-cyan-400/20"
            type="submit"
          >
            Save and continue
          </button>
        </form>
      )}
    </section>
  );
}
