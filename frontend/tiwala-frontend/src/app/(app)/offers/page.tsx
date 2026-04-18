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
        ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200/85"
        : "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "Accepted",
    };
  if (s === "declined")
    return {
      classes: isDark
        ? "border-rose-400/20 bg-rose-400/[0.08] text-rose-200/85"
        : "border-rose-200 bg-rose-50 text-rose-700",
      label: "Declined",
    };
  return {
    classes: isDark
      ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-200/85"
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
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    pageClass,
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

  const surfaceClass = isDarkTheme
    ? "min-h-screen bg-[#0A0A0F] text-white"
    : "min-h-screen bg-[#f7f7f4] text-[#0d0d10]";
  const statCardClass = isDarkTheme
    ? "border border-white/[0.12] bg-white/[0.035]"
    : "border border-[#d7d7d2] bg-white";
  const listPanelClass = isDarkTheme
    ? "border border-white/[0.12] bg-white/[0.035]"
    : "border border-[#d7d7d2] bg-white";
  const listDividerClass = isDarkTheme ? "border-white/[0.10]" : "border-[#d9d9d4]";
  const rowHoverClass = isDarkTheme ? "hover:bg-white/[0.035]" : "hover:bg-[#fbfbf8]";
  const tabClass = isDarkTheme
    ? "border border-white/20 bg-transparent text-white/86 hover:bg-white/[0.06]"
    : "border border-[#bfc0ba] bg-white text-[#0d0d10] hover:bg-[#f4f4ef]";
  const activeTabClass = isDarkTheme
    ? "border-white/70 bg-white text-[#0A0A0F]"
    : "border-[#0d0d10] bg-[#0d0d10] text-white";

  if (!isConnected || !profile) {
    return (
      <div className={`${pageClass} ${surfaceClass}`}>
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
    <div className={`${pageClass} ${surfaceClass}`}>
      <section className="mx-auto w-full max-w-[680px] space-y-7 py-4">
        {/* Hero */}
        <header>
          <p className={`text-[11px] font-bold uppercase tracking-[0.22em] ${isDarkTheme ? "text-white/75" : "text-[#171717]"}`}>
            {isEmployerView ? "Employer" : "Freelancer"}
          </p>
          <h1
            className={`mt-1 text-2xl font-semibold tracking-tight ${titleClass}`}
          >
            {isEmployerView ? "Sent job offers" : "Incoming job offers"}
          </h1>
          <p className={`mt-1 text-sm leading-6 ${isDarkTheme ? "text-white/72" : "text-[#171717]"}`}>
            {isEmployerView
              ? "Review contracts sent to freelancers and track their status."
              : "Review contracts sent to your wallet and track their status."}
          </p>
        </header>

        {/* Summary chips */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Pending",
              value: counts.pending,
              icon: Clock,
              border: "border-l-amber-400",
              iconBg: isDarkTheme
                ? "bg-amber-400/10 text-amber-200/85"
                : "bg-amber-50 text-amber-700",
            },
            {
              label: "Accepted",
              value: counts.accepted,
              icon: BriefcaseBusiness,
              border: "border-l-emerald-400",
              iconBg: isDarkTheme
                ? "bg-emerald-400/10 text-emerald-200/85"
                : "bg-emerald-50 text-emerald-700",
            },
            {
              label: "Total value",
              value: `${offers
                .reduce((s, o) => s + Number(o.amountUsdt), 0)
                .toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`,
              icon: CircleDollarSign,
              border: "border-l-blue-400",
              iconBg: isDarkTheme
                ? "bg-blue-400/10 text-blue-200/85"
                : "bg-blue-50 text-blue-700",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className={`${statCardClass} rounded-lg border-l-2 ${stat.border} p-5`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
                >
                  {stat.label}
                </p>
                <span
                  className={`inline-flex size-8 items-center justify-center rounded-md ${stat.iconBg}`}
                >
                  <stat.icon size={16} />
                </span>
              </div>
              <p
                className={`mt-2 text-2xl font-semibold tabular-nums leading-none ${titleClass}`}
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
        <section className={`${listPanelClass} overflow-hidden rounded-lg`}>
          <div className={`flex items-center justify-between border-b px-5 py-4 ${listDividerClass}`}>
            <h2
              className={`text-base font-semibold tracking-tight ${titleClass}`}
            >
              {isEmployerView ? "Your job offers" : "Pending job offers"}
            </h2>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${
                isDarkTheme
                  ? "border-white/15 bg-white/[0.03] text-white/80"
                  : "border-[#c9cac4] bg-[#f7f7f4] text-[#30302d]"
              }`}
            >
              {filtered.length} of {counts.total}
            </span>
          </div>

          <div className={`border-b px-5 py-3 ${listDividerClass}`}>
            <div className="flex flex-wrap gap-1.5 text-sm">
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
                    className={`rounded-md px-4 py-2 font-medium transition ${
                      active ? activeTabClass : tabClass
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className={`divide-y ${listDividerClass}`}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-5 py-5">
                  <div
                    className={`h-10 animate-pulse rounded-lg ${
                      isDarkTheme ? "bg-white/[0.05]" : "bg-gray-200"
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="flex flex-col items-center gap-4 px-5 py-14 text-center"
            >
              <span
                className={`inline-flex size-12 items-center justify-center rounded-full ${
                  isDarkTheme ? "bg-white/[0.04] text-white/45" : "bg-white text-gray-400"
                }`}
              >
                <Inbox size={22} />
              </span>
              <div>
                <p className={`text-sm font-semibold ${titleClass}`}>
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
            <div className={`divide-y ${listDividerClass}`}>
              {filtered.map((offer) => {
                const style = getStatusStyle(offer.status, isDarkTheme);
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => router.push(`/offers/${offer.id}`)}
                    className={`group grid w-full grid-cols-1 gap-3 px-5 py-4 text-left transition sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${rowHoverClass}`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p
                          className={`min-w-0 truncate text-base font-semibold ${titleClass}`}
                        >
                          {offer.title || `Offer #${offer.id}`}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.classes}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-xs tabular-nums ${isDarkTheme ? "text-white/55" : "text-[#30302d]"}`}
                      >
                        {isEmployerView
                          ? shortAddr(offer.freelancerWallet)
                          : shortAddr(offer.employerWallet)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                      <p className={`text-sm font-semibold tabular-nums ${titleClass}`}>
                        {offer.amountUsdt.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        USDT
                      </p>
                      <p className={`mt-0 text-[11px] sm:mt-1 ${mutedTextClass}`}>
                        {relativeTime(offer.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`hidden size-8 shrink-0 items-center justify-center rounded-md border transition sm:inline-flex ${
                        isDarkTheme
                          ? "border-white/15 text-white/45 group-hover:text-white/75"
                          : "border-[#bfc0ba] text-[#30302d] group-hover:bg-[#f4f4ef]"
                      }`}
                    >
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
