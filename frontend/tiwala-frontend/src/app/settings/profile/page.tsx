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
import { notifyError, notifySuccess } from "@/lib/notify";

const roleOptions: Array<{ label: string; value: UserRole }> = [
  { label: "Freelancer", value: "freelancer" },
  { label: "Employer", value: "employer" },
  { label: "Both", value: "both" },
];

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isDarkTheme } = useAppTheme();

   const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
   const panelClass = isDarkTheme
     ? "border border-white/12 bg-black/32"
     : "border border-[#e6e8f1] bg-white";
   const subtlePanelClass = isDarkTheme
     ? "border border-white/12 bg-white/[0.03]"
     : "border border-[#eaecf4] bg-[#fafbff]";
   const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
   const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
   const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
   const chipClass = isDarkTheme
     ? "border border-white/14 bg-white/[0.04] text-white/82"
     : "border border-[#e1e4f0] bg-white text-[#2a3040]";
   const actionChipClass = isDarkTheme
     ? "border border-violet-300/30 bg-violet-500/14 text-violet-100"
     : "border border-violet-200 bg-violet-50 text-violet-700";
   const inputClass = isDarkTheme
     ? "h-11 w-full rounded-xl border border-white/14 bg-black/40 px-4 text-white outline-none transition placeholder:text-white/40 focus:border-violet-400/50"
     : "h-11 w-full rounded-xl border border-[#e1e4f0] bg-white px-4 text-[#11131b] outline-none transition placeholder:text-[#73788b] focus:border-violet-400";

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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingDisplayName, setPendingDisplayName] = useState("");
  const [pendingRole, setPendingRole] = useState<UserRole>("freelancer");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (!profile) {
      router.replace("/onboarding");
    }
  }, [address, isConnected, profile, router]);

  const displayNameValue = nameTouched ? displayName : profile?.displayName ?? "";
  const roleValue = roleTouched ? role : profile?.role ?? "freelancer";
  const hasChanges =
    (profile?.displayName ?? "").trim() !== displayNameValue.trim() ||
    (profile?.role ?? "freelancer") !== roleValue;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsConfirmOpen(false);

    if (!isConnected || !address) {
      const msg = "Connect your wallet first.";
      setError(msg);
      notifyError(msg);
      return;
    }

    const normalizedName = displayNameValue.trim();
    if (normalizedName.length < 2) {
      const msg = "Display name must be at least 2 characters.";
      setError(msg);
      notifyError(msg);
      return;
    }

    if (!hasChanges) {
      setSuccess("No changes to save.");
      return;
    }

    setPendingDisplayName(normalizedName);
    setPendingRole(roleValue);
    setIsConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setError("");
    setSuccess("");

    if (!isConnected || !address) {
      const msg = "Connect your wallet first.";
      setError(msg);
      notifyError(msg);
      return;
    }

    const normalizedName = pendingDisplayName.trim();
    if (normalizedName.length < 2) {
      const msg = "Display name must be at least 2 characters.";
      setError(msg);
      notifyError(msg);
      return;
    }

    const authSession = getStoredAuthSession();
    if (
      !authSession ||
      authSession.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      const msg = "Please sign in with your wallet first.";
      setError(msg);
      notifyError(msg);
      return;
    }

    setIsSaving(true);

    try {
      await updateCurrentUserProfile(authSession.accessToken, {
        displayName: normalizedName,
        role: pendingRole,
      });
    } catch {
      const msg = "Unable to update profile on the server.";
      setError(msg);
      notifyError(msg);
      setIsSaving(false);
      return;
    }

    saveStoredProfile({
      wallet: address.toLowerCase(),
      displayName: normalizedName,
      role: pendingRole,
      updatedAt: new Date().toISOString(),
    });

    setIsSaving(false);
    setIsConfirmOpen(false);
    setSuccess("Profile updated successfully.");
    notifySuccess("Profile updated successfully.");
    setNameTouched(true);
    setRoleTouched(true);
    setDisplayName(normalizedName);
    setRole(pendingRole);
  };

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Account
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Profile settings
          </h1>
          <p className={`mt-2 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Update the name and role other users see across TiwalaChain.
          </p>
          {profile && address ? (
            <div className="mt-4 inline-flex flex-wrap items-center gap-2 text-xs">
              <span className={`${chipClass} rounded-full px-3 py-1`}>
                Wallet: {`${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
              <span className={`${chipClass} rounded-full px-3 py-1 capitalize`}>
                Current role: {profile.role}
              </span>
            </div>
          ) : null}
        </article>

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <form className="space-y-6" onSubmit={onSubmit}>
            <section className={`${subtlePanelClass} rounded-xl p-4 sm:p-5`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                Identity
              </p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
                Display name
              </h2>
              <p className={`mt-1 text-xs ${mutedTextClass}`}>
                This is how employers and freelancers see you in the app.
              </p>

              <div className="mt-4">
                <label
                  className={`mb-2 flex items-center gap-2 text-sm font-medium ${titleClass}`}
                  htmlFor="displayName"
                >
                  <UserRound size={14} className="text-violet-400" />
                  Display name
                </label>
                <input
                  id="displayName"
                  className={inputClass}
                  onChange={(event) => {
                    setNameTouched(true);
                    setDisplayName(event.target.value);
                  }}
                  value={displayNameValue}
                  placeholder="Your name or brand"
                />
              </div>
            </section>

            <section className={`${subtlePanelClass} rounded-xl p-4 sm:p-5`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                Role
              </p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
                How you use TiwalaChain
              </h2>
              <p className={`mt-1 text-xs ${mutedTextClass}`}>
                Your role controls whether you can create jobs, accept work, or both.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                          ? isDarkTheme
                            ? "border-violet-300/70 bg-violet-500/20 text-violet-50 shadow-[0_0_0_1px_rgba(196,181,253,0.3)_inset]"
                            : "border-violet-300 bg-violet-50 text-violet-800 shadow-[0_0_0_1px_rgba(196,181,253,0.6)_inset]"
                          : isDarkTheme
                            ? "border-white/15 bg-white/[0.03] text-white/70 hover:border-white/30 hover:bg-white/[0.06]"
                            : "border-[#dde1ec] bg-white text-[#5c6172] hover:border-violet-300 hover:bg-violet-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {error ? (
              <p
                className={`rounded-xl border p-3 text-sm ${
                  isDarkTheme
                    ? "border-red-400/35 bg-red-500/12 text-red-100"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {error}
              </p>
            ) : null}

            {success ? (
              <p
                className={`rounded-xl border p-3 text-sm ${
                  isDarkTheme
                    ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {success}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                disabled={isSaving}
                type="submit"
              >
                <Save size={15} />
                Review changes
              </button>
            </div>
          </form>
        </article>
      </section>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${
              isDarkTheme
                ? "border-white/12 bg-[#0b0f1a]"
                : "border-[#e6e8f1] bg-white"
            }`}
          >
            <div className="p-5 sm:p-6">
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                Confirm changes
              </p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
                Save profile updates?
              </h2>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>
                You&apos;re about to update your profile. Review the new details before saving.
              </p>

              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    Display name
                  </dt>
                  <dd className={`mt-1 font-medium ${titleClass}`}>
                    {pendingDisplayName || displayNameValue}
                  </dd>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    Current: {profile?.displayName || "Not set"}
                  </p>
                </div>
                <div>
                  <dt className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    Role
                  </dt>
                  <dd className={`mt-1 font-medium capitalize ${titleClass}`}>
                    {pendingRole}
                  </dd>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    Current: {profile?.role ?? "freelancer"}
                  </p>
                </div>
              </dl>

              <p className={`mt-3 text-xs ${mutedTextClass}`}>
                Role changes affect which dashboards and job actions are available to you.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSaving}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                >
                  <Save size={14} />
                  {isSaving ? "Saving..." : "Confirm & save"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  disabled={isSaving}
                  className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-xs font-medium transition ${
                    isDarkTheme
                      ? "border border-white/12 bg-white/[0.02] text-white/75 hover:bg-white/[0.05]"
                      : "border border-[#dde1ec] bg-white text-[#4b5164] hover:border-violet-300 hover:text-[#2a3040]"
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
