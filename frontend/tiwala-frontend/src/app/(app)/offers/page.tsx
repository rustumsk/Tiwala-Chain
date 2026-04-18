"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Clock,
  Inbox,
} from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { getStoredAuthSession } from "@/lib/auth";
import { notifyError } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";
import {
  fetchIncomingOffers,
  fetchSentOffers,
  type JobResponse,
} from "@/lib/jobs";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const OFFER_STATUS_FILTERS = ["all", "pending", "accepted", "declined"] as const;
type OfferStatusFilter = (typeof OFFER_STATUS_FILTERS)[number];

function getStatusStyle(
  status: string,
  isDark: boolean
): { classes: string; label: string } {
  const s = status.toLowerCase();
  if (s === "accepted")
    return {
      classes: isDark
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Accepted",
    };
  if (s === "declined")
    return {
      classes: isDark
        ? "border-red-400/30 bg-red-500/10 text-red-300"
        : "border-red-200 bg-red-50 text-red-700",
      label: "Declined",
    };
  return {
    classes: isDark
      ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
      : "border-amber-200 bg-amber-50 text-amber-700",
    label: "Pending",
  };
}

export default function OffersPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const {
    isDarkTheme,
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    pageClass,
    actionChipClass,
  } = useThemeStyles();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const [offers, setOffers] = useState<JobResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] =
    usePersistedSessionString<OfferStatusFilter>(
      "tiwala:offers:statusFilter",
      "all",
      OFFER_STATUS_FILTERS
    );
  const [workspaceTab] = usePersistedSessionString<"employer" | "freelancer">(
    "tiwala:dashboard:workspaceTab",
    "employer",
    ["employer", "freelancer"]
  );

  const isEmployerView =
    profile?.role === "employer" ||
    (profile?.role === "both" && workspaceTab === "employer");

  const loadOffers = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isConnected || !address) return;
      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== address.toLowerCase()
      )
        return;

      if (!opts?.silent) {
        setIsLoading(true);
        setError("");
      }

      const loader = isEmployerView ? fetchSentOffers : fetchIncomingOffers;

      try {
        const data = await loader(session);
        setOffers(data);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load offers.";
        setError(msg);
        if (!opts?.silent) notifyError(msg);
      } finally {
        if (!opts?.silent) setIsLoading(false);
      }
    },
    [address, isConnected, isEmployerView]
  );

  useEffect(() => {
    void loadOffers({ silent: false });
  }, [loadOffers]);

  useVisibleInterval(
    () => void loadOffers({ silent: true }),
    API_POLL_INTERVAL_MS,
    Boolean(
      isConnected &&
        address &&
        getStoredAuthSession()?.walletAddress.toLowerCase() ===
          address.toLowerCase() &&
        profile
    )
  );

  const filtered = offers.filter((offer) => {
    if (statusFilter === "all") return true;
    const s = offer.status.toLowerCase();
    if (statusFilter === "pending")
      return s === "pendingoffer" || s === "pending";
    if (statusFilter === "accepted") return s === "accepted";
    if (statusFilter === "declined") return s === "declined";
    return true;
  });

  const counts = useMemo(() => {
    let pending = 0,
      accepted = 0,
      declined = 0;
    for (const o of offers) {
      const s = o.status.toLowerCase();
      if (s === "accepted") accepted++;
      else if (s === "declined") declined++;
      else pending++;
    }
    return { pending, accepted, declined, total: offers.length };
  }, [offers]);

  if (!isConnected || !profile) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-2xl px-6 py-10 lg:px-8`}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <span
              className={`inline-flex size-14 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}
            >
              <Inbox
                size={26}
                className={isDarkTheme ? "text-violet-400/60" : "text-violet-400"}
              />
            </span>
            <h1
              className={`text-2xl font-bold tracking-tight ${titleClass}`}
            >
              {!isConnected
                ? "Connect wallet to continue"
                : "Complete onboarding"}
            </h1>
            <p className={`max-w-md text-sm leading-6 ${mutedTextClass}`}>
              {!isConnected
                ? "Connect your wallet from the navbar to see offers sent to you."
                : "Finish your profile setup so we can match offers to your wallet."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-6">
        {/* Hero */}
        <article className={`${panelClass} rounded-2xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            {isEmployerView ? "Employer" : "Freelancer"}
          </p>
          <h1
            className={`mt-2 text-3xl font-bold tracking-tight ${titleClass}`}
          >
            {isEmployerView ? "Sent job offers" : "Incoming job offers"}
          </h1>
          <p className={`mt-1.5 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            {isEmployerView
              ? "Review contracts you have sent to freelancers, and track whether they are pending, accepted, or declined."
              : "Review contracts that employers have sent to your wallet, run AI analysis, and accept or decline the work."}
          </p>
        </article>

        {/* Summary chips */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Pending",
              value: counts.pending,
              icon: Clock,
              border: isDarkTheme
                ? "border-l-amber-400"
                : "border-l-amber-500",
              iconBg: isDarkTheme
                ? "bg-amber-500/15 text-amber-300"
                : "bg-amber-100 text-amber-600",
            },
            {
              label: "Accepted",
              value: counts.accepted,
              icon: BriefcaseBusiness,
              border: isDarkTheme
                ? "border-l-emerald-400"
                : "border-l-emerald-500",
              iconBg: isDarkTheme
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-emerald-100 text-emerald-600",
            },
            {
              label: "Total value",
              value: `${offers
                .reduce((s, o) => s + Number(o.amountUsdt), 0)
                .toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`,
              icon: CircleDollarSign,
              border: isDarkTheme
                ? "border-l-violet-400"
                : "border-l-violet-500",
              iconBg: isDarkTheme
                ? "bg-violet-500/15 text-violet-300"
                : "bg-violet-100 text-violet-600",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className={`${panelClass} rounded-2xl border-l-[3px] ${stat.border} p-5`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
                >
                  {stat.label}
                </p>
                <span
                  className={`inline-flex size-9 items-center justify-center rounded-xl ${stat.iconBg}`}
                >
                  <stat.icon size={16} />
                </span>
              </div>
              <p
                className={`mt-3 text-2xl font-bold tabular-nums ${titleClass}`}
              >
                {stat.value}
              </p>
            </article>
          ))}
        </div>

        {/* Error banner */}
        {error ? (
          <div
            className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-sm ${
              isDarkTheme
                ? "border-red-400/20 bg-red-500/[0.06] text-red-300"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {error}
          </div>
        ) : null}

        {/* Offers list */}
        <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
              >
                Offers
              </p>
              <h2
                className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}
              >
                {isEmployerView ? "Your job offers" : "Pending job offers"}
              </h2>
            </div>
            <span
              className={`${actionChipClass} self-start rounded-full px-3.5 py-1.5 text-xs font-semibold tabular-nums`}
            >
              {filtered.length} of {counts.total}
            </span>
          </div>

          {/* Filters */}
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {(
              [
                { key: "all", label: "All" },
                { key: "pending", label: "Pending" },
                { key: "accepted", label: "Accepted" },
                { key: "declined", label: "Declined" },
              ] as const
            ).map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setStatusFilter(opt.key as OfferStatusFilter)
                  }
                  className={`rounded-full px-3.5 py-1.5 font-medium transition ${
                    active
                      ? isDarkTheme
                        ? "border border-violet-300/60 bg-violet-500/25 text-violet-50"
                        : "border border-violet-400 bg-violet-100 text-violet-800"
                      : isDarkTheme
                        ? "border border-white/10 bg-white/[0.02] text-white/65 hover:border-violet-300/30 hover:bg-violet-500/10"
                        : "border border-[#e1e4f0] bg-white text-[#555a6b] hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <div className="mt-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-20 animate-pulse rounded-xl ${subtlePanelClass}`}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className={`mt-6 flex flex-col items-center gap-5 rounded-2xl py-14 ${subtlePanelClass}`}
            >
              <span
                className={`inline-flex size-16 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}
              >
                <Inbox size={28} className="text-violet-400/60" />
              </span>
              <div className="text-center">
                <p className={`text-sm font-medium ${titleClass}`}>
                  No offers found
                </p>
                <p
                  className={`mt-1.5 max-w-sm text-sm ${mutedTextClass}`}
                >
                  {isEmployerView
                    ? "You haven't sent any job offers yet. Create a job from the dashboard to send your first offer."
                    : "No pending offers right now. When employers send job offers to your wallet, they will appear here."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {filtered.map((offer) => {
                const style = getStatusStyle(offer.status, isDarkTheme);
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => router.push(`/offers/${offer.id}`)}
                    className={`${subtlePanelClass} group flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left transition-all duration-200 hover:border-violet-300/40 ${isDarkTheme ? "hover:bg-violet-500/[0.04]" : "hover:bg-violet-50/40"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${titleClass}`}
                      >
                        {offer.title || `Offer #${offer.id}`}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={`text-xs tabular-nums ${mutedTextClass}`}
                        >
                          {isEmployerView
                            ? shortAddr(offer.freelancerWallet)
                            : shortAddr(offer.employerWallet)}
                        </span>
                        <span
                          className={`text-xs ${isDarkTheme ? "text-white/20" : "text-[#d0d3de]"}`}
                        >
                          |
                        </span>
                        <span
                          className={`text-xs font-medium tabular-nums ${titleClass}`}
                        >
                          {offer.amountUsdt.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          USDT
                        </span>
                        <span
                          className={`text-xs ${isDarkTheme ? "text-white/20" : "text-[#d0d3de]"}`}
                        >
                          |
                        </span>
                        <span
                          className={`text-xs ${mutedTextClass}`}
                        >
                          {relativeTime(offer.createdAt)}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${style.classes}`}
                    >
                      {style.label}
                    </span>

                    <ArrowUpRight
                      size={16}
                      className={`shrink-0 transition ${isDarkTheme ? "text-white/20 group-hover:text-violet-300" : "text-[#c8cbda] group-hover:text-violet-500"}`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
