"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Save, UserRound } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  getStoredProfile,
  saveStoredProfile,
  type UserRole,
} from "@/lib/profile";
import { getStoredAuthSession, updateCurrentUserProfile } from "@/lib/auth";

const roleOptions: Array<{ label: string; value: UserRole }> = [
  { label: "Freelancer", value: "freelancer" },
  { label: "Employer", value: "employer" },
  { label: "Both", value: "both" },
];

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isDarkTheme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase() ? existing : null;
  }, [address, isConnected]);

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("freelancer");
  const [nameTouched, setNameTouched] = useState(false);
  const [roleTouched, setRoleTouched] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (!profile) {
      router.replace("/onboarding");
    }
  }, [address, isConnected, profile, router]);

  const displayNameValue = nameTouched ? displayName : profile?.displayName ?? "";
  const roleValue = roleTouched ? role : profile?.role ?? "freelancer";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }

    const normalizedName = displayNameValue.trim();
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

    setIsSaving(true);

    try {
      await updateCurrentUserProfile(authSession.accessToken, {
        displayName: normalizedName,
        role: roleValue,
      });
    } catch {
      setError("Unable to update profile on the server.");
      setIsSaving(false);
      return;
    }

    saveStoredProfile({
      wallet: address.toLowerCase(),
      displayName: normalizedName,
      role: roleValue,
      updatedAt: new Date().toISOString(),
    });

    setIsSaving(false);
    setSuccess("Profile updated successfully.");
  };

  return (
    <div className="themed-app-page text-slate-100">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <article
          className={`p-8 ${
            isDarkTheme
              ? "border border-white/12 bg-black/28"
              : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
          }`}
        >
          <h1 className="text-2xl font-semibold">Profile Settings</h1>
          <p className="mt-2 text-sm text-slate-300">
            Update your display name and work role for the main app.
          </p>
        </article>

        <article
          className={`p-8 ${
            isDarkTheme
              ? "border border-white/12 bg-black/28"
              : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
          }`}
        >
          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label
                className="mb-2 flex items-center gap-2 text-sm font-medium text-white/85"
                htmlFor="displayName"
              >
                <UserRound size={14} className="text-violet-300" />
                Display Name
              </label>
              <input
                id="displayName"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 text-white outline-none transition-all duration-200 placeholder:text-white/35 focus:border-violet-300/70 focus:bg-white/[0.06]"
                onChange={(event) => {
                  setNameTouched(true);
                  setDisplayName(event.target.value);
                }}
                value={displayNameValue}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/85">Role</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {roleOptions.map((option) => {
                  const selected = roleValue === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setRoleTouched(true);
                        setRole(option.value);
                      }}
                      className={`h-11 rounded-xl border text-sm font-medium transition-all duration-200 ${
                        selected
                          ? "border-violet-300/60 bg-violet-400/20 text-violet-100 shadow-[0_0_0_1px_rgba(196,181,253,0.2)_inset]"
                          : "border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:bg-white/[0.07]"
                      }`}
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

            {success ? (
              <p className="rounded-xl border border-emerald-300/35 bg-emerald-500/12 p-3 text-sm text-emerald-100">
                {success}
              </p>
            ) : null}

            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-300/40 bg-violet-500/25 px-5 text-sm font-semibold text-violet-100 transition-all duration-200 hover:border-violet-200/70 hover:bg-violet-500/35"
              disabled={isSaving}
              type="submit"
            >
              <Save size={15} />
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
