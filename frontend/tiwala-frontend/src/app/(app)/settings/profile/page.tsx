"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { Save, Trash2, UserRound, Wallet } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  clearStoredProfile,
  getStoredProfile,
  saveStoredProfile,
} from "@/lib/profile";
import {
  clearAuthSession,
  deleteOwnAccount,
  fetchCurrentUser,
  getStoredAuthSession,
  updateCurrentUserProfile,
  type BackendUser,
} from "@/lib/auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usdtAbi, USDT_SEPOLIA_ADDRESS } from "@/lib/usdt";

function formatWalletUsdt(value: bigint | undefined) {
  if (typeof value !== "bigint") return "0.00";
  const numeric = Number(formatUnits(value, 6));
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
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
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingDisplayName, setPendingDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [me, setMe] = useState<BackendUser | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const usdtBalanceQuery = useReadContract({
    address: USDT_SEPOLIA_ADDRESS,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && chainId === 11155111),
      refetchOnWindowFocus: true,
    },
  });

  useEffect(() => {
    if (!isConnected || !address) return;
    if (!profile) {
      router.replace("/onboarding");
    }
  }, [address, isConnected, profile, router]);

  useEffect(() => {
    if (!isConnected || !address || !profile) return;
    const session = getStoredAuthSession();
    if (!session || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
      return;
    }
    let cancelled = false;
    fetchCurrentUser(session.accessToken)
      .then((user) => {
        if (!cancelled) setMe(user);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, profile]);

  const deleteBlockedReason = useMemo(() => {
    if (!me) return "Loading account status…";
    if (me.role === "admin") {
      return "Admin accounts cannot be deleted from the app. Contact support if you need this removed.";
    }
    if (me.canDeleteAccount !== true) {
      return "You have a pending offer or an accepted job. Finish or resolve those before deleting your account.";
    }
    return null;
  }, [me]);

  const canDeleteAccount = me?.canDeleteAccount === true && me.role !== "admin";

  const displayNameValue = nameTouched ? displayName : profile?.displayName ?? "";
  const hasChanges =
    (profile?.displayName ?? "").trim() !== displayNameValue.trim();

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
        role: profile?.role ?? "freelancer",
      });
      const refreshed = await fetchCurrentUser(authSession.accessToken);
      setMe(refreshed);
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
      role: profile?.role ?? "freelancer",
      updatedAt: new Date().toISOString(),
    });

    setIsSaving(false);
    setIsConfirmOpen(false);
    setSuccess("Profile updated successfully.");
    notifySuccess("Profile updated successfully.");
    setNameTouched(true);
    setDisplayName(normalizedName);
  };

  const handleDeleteAccount = async () => {
    setError("");
    setSuccess("");
    if (!isConnected || !address) {
      const msg = "Connect your wallet first.";
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
    setIsDeleting(true);
    try {
      await deleteOwnAccount(authSession.accessToken);
      clearAuthSession();
      clearStoredProfile();
      setIsDeleteOpen(false);
      notifySuccess("Your account was deleted.");
      router.replace("/onboarding");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not delete your account.";
      setError(msg);
      notifyError(msg);
    } finally {
      setIsDeleting(false);
    }
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
                Current role: {me?.role ?? profile.role}
              </span>
            </div>
          ) : null}
        </article>

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                Wallet
              </p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
                USDT balance
              </h2>
              <p className={`mt-1 text-xs ${mutedTextClass}`}>
                Available balance in the connected Sepolia wallet.
              </p>
            </div>
            <span
              className={`inline-flex size-9 items-center justify-center rounded-full ${
                isDarkTheme
                  ? "bg-violet-400/10 text-violet-200"
                  : "bg-violet-50 text-violet-700"
              }`}
            >
              <Wallet size={17} />
            </span>
          </div>
          <p className={`mt-5 text-3xl font-semibold tabular-nums ${titleClass}`}>
            {formatWalletUsdt(usdtBalanceQuery.data)}
            <span className={`ml-1 text-xs font-semibold ${mutedTextClass}`}>USDT</span>
          </p>
          <p className={`mt-3 text-xs ${mutedTextClass}`}>
            {chainId !== 11155111
              ? "Switch to Sepolia to read your balance."
              : usdtBalanceQuery.isLoading
                ? "Reading wallet balance..."
                : usdtBalanceQuery.isError
                  ? "Balance unavailable right now."
                  : "Balance refreshes when the profile page regains focus."}
          </p>
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

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <section className={`${subtlePanelClass} rounded-xl border border-red-500/25 p-4 sm:p-5`}>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
              Danger zone
            </p>
            <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
              Delete account
            </h2>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>
              Permanently remove your TiwalaChain account. You can do this only if you have no pending
              offers or accepted jobs. Your wallet is unchanged on-chain.
            </p>
            <button
              type="button"
              disabled={!canDeleteAccount}
              onClick={() => canDeleteAccount && setIsDeleteOpen(true)}
              title={deleteBlockedReason ?? "Delete your account"}
              className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                isDarkTheme
                  ? "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/18"
                  : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
              }`}
            >
              <Trash2 size={14} />
              Delete my account
            </button>
          </section>
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
              </dl>

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

      {isDeleteOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${
              isDarkTheme
                ? "border-red-400/25 bg-[#0b0f1a]"
                : "border-red-200 bg-white"
            }`}
          >
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-400/90">
                Delete account
              </p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>
                Delete your account permanently?
              </h2>
              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                This removes your profile from TiwalaChain. You will need to sign in again to create a new
                account. Escrow jobs on the blockchain are not reversed by this action.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setIsDeleteOpen(false)}
                  disabled={isDeleting}
                  className={`rounded-lg px-3 py-1.5 ${mutedTextClass}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {isDeleting ? "Deleting…" : "Yes, delete my account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
