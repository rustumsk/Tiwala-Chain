"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import JobCard from "@/components/jobs/job-card";
import { useEmployerJobs, useFreelancerJobs } from "@/hooks/use-escrow-jobs";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import { getStoredAuthSession } from "@/lib/auth";
import {
  JOB_STATUS_LABEL,
  type EscrowJobStatus,
} from "@/lib/contract";
import { fetchUnreadNotificationCount } from "@/lib/notifications";
import { fetchMyPostingStats } from "@/lib/postings";
import { getStoredProfile, type LocalUserProfile } from "@/lib/profile";
import { fetchMyProposalStats } from "@/lib/proposals";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";
import { usdtAbi, USDT_SEPOLIA_ADDRESS } from "@/lib/usdt";
import type { EscrowJob } from "@/types";

type DashboardView = "employer" | "freelancer";

const STATUS_COLORS: Record<EscrowJobStatus, { ring: string; dot: string; text: string }> = {
  0: { ring: "#94a3b8", dot: "bg-slate-400", text: "text-slate-300" },
  1: { ring: "#60a5fa", dot: "bg-blue-400", text: "text-blue-300" },
  2: { ring: "#fbbf24", dot: "bg-amber-400", text: "text-amber-300" },
  3: { ring: "#fb923c", dot: "bg-orange-400", text: "text-orange-300" },
  4: { ring: "#f87171", dot: "bg-red-400", text: "text-red-300" },
  5: { ring: "#34d399", dot: "bg-emerald-400", text: "text-emerald-300" },
  6: { ring: "#a78bfa", dot: "bg-purple-400", text: "text-purple-300" },
};

const STATUS_COLORS_LIGHT: Record<EscrowJobStatus, { dot: string; text: string }> = {
  0: { dot: "bg-slate-500", text: "text-slate-600" },
  1: { dot: "bg-blue-500", text: "text-blue-600" },
  2: { dot: "bg-amber-500", text: "text-amber-600" },
  3: { dot: "bg-orange-500", text: "text-orange-600" },
  4: { dot: "bg-red-500", text: "text-red-600" },
  5: { dot: "bg-emerald-500", text: "text-emerald-600" },
  6: { dot: "bg-purple-500", text: "text-purple-600" },
};

function formatUsdtValue(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatWalletUsdt(value: bigint | undefined) {
  if (typeof value !== "bigint") return "0.00";
  const numeric = Number(formatUnits(value, 6));
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function countJobsByStatuses(jobs: EscrowJob[], statuses: number[]) {
  return jobs.filter((job) => statuses.includes(job.status)).length;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function DonutChart({
  jobs,
  isDark,
}: {
  jobs: EscrowJob[];
  isDark: boolean;
}) {
  const total = jobs.length;
  const SIZE = 160;
  const STROKE = 22;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const segments = useMemo(() => {
    const counts: { status: EscrowJobStatus; count: number }[] = [];
    for (let s = 0; s <= 6; s++) {
      const count = jobs.filter((j) => j.status === s).length;
      if (count > 0) counts.push({ status: s as EscrowJobStatus, count });
    }
    let offset = 0;
    return counts.map(({ status, count }) => {
      const pct = count / total;
      const dashLength = pct * CIRCUMFERENCE;
      const seg = {
        status,
        count,
        pct,
        dashArray: `${dashLength} ${CIRCUMFERENCE - dashLength}`,
        dashOffset: -offset,
        color: STATUS_COLORS[status].ring,
      };
      offset += dashLength;
      return seg;
    });
  }, [jobs, total, CIRCUMFERENCE]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
            strokeWidth={STROKE}
          />
          <text
            x={SIZE / 2}
            y={SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)"}
            fontSize="13"
            fontWeight="500"
          >
            No jobs
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}
          strokeWidth={STROKE}
        />
        {segments.map((seg) => (
          <circle
            key={seg.status}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="transition-all duration-700 ease-out"
          />
        ))}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isDark ? "#fff" : "#111"}
          fontSize="28"
          fontWeight="700"
          fontFamily="inherit"
        >
          {total}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 14}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"}
          fontSize="11"
          fontWeight="500"
          fontFamily="inherit"
          letterSpacing="0.05em"
        >
          TOTAL
        </text>
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { theme, isDarkTheme, panelClass, subtlePanelClass, mutedTextClass, tinyLabelClass, titleClass, pageClass, chipClass, actionChipClass } = useThemeStyles();
  const profile = useMemo<LocalUserProfile | null>(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase()
      ? existing
      : null;
  }, [address, isConnected]);

  const showEmployerList = profile?.role === "employer" || profile?.role === "both";
  const showFreelancerList = profile?.role === "freelancer" || profile?.role === "both";

  const [dualWorkspaceTab, setDualWorkspaceTab] = usePersistedSessionString<DashboardView>(
    "tiwala:dashboard:workspaceTab",
    "employer",
    ["employer", "freelancer"]
  );

  const activeView: DashboardView =
    showEmployerList && showFreelancerList
      ? dualWorkspaceTab
      : showEmployerList && !showFreelancerList
        ? "employer"
        : !showEmployerList && showFreelancerList
          ? "freelancer"
          : "employer";

  const employerJobs = useEmployerJobs({
    walletAddress: address,
    enabled: Boolean(
      isConnected &&
        address &&
        showEmployerList &&
        (!showFreelancerList || activeView === "employer")
    ),
  });

  const freelancerJobs = useFreelancerJobs({
    walletAddress: address,
    enabled: Boolean(
      isConnected &&
        address &&
        showFreelancerList &&
        (!showEmployerList || activeView === "freelancer")
    ),
  });

  const activeConfig = useMemo(() => {
    const jobs = activeView === "employer" ? employerJobs.jobs : freelancerJobs.jobs;
    const isLoading =
      activeView === "employer" ? employerJobs.isLoading : freelancerJobs.isLoading;
    const isError =
      activeView === "employer" ? employerJobs.isError : freelancerJobs.isError;
    const jobIds =
      activeView === "employer" ? employerJobs.jobIds : freelancerJobs.jobIds;
    const totalEscrow = jobs.reduce(
      (sum, job) => sum + Number(job.amount) / 1_000_000,
      0
    );
    const disputedCount = countJobsByStatuses(jobs, [4]);
    const activeCount = countJobsByStatuses(jobs, [1, 2, 3]);

    if (activeView === "employer") {
      return {
        workspaceEyebrow: "Employer",
        title: "Dashboard",
        subtitle:
          "Overview of your escrow jobs, funding, and releases — scoped to your wallet.",
        isLoading,
        isError,
        queueTitle: "Employer jobs",
        queueCountLabel: `${jobIds.length} total`,
        jobs,
        totalEscrow,
        disputedCount,
        activeCount,
        jobCount: jobs.length,
        counterpartyLabel: "Freelancer",
        emptyMessage: "You haven't created any escrow jobs yet. Start by creating your first job offer.",
        emptyActionHref: "/jobs/create",
        emptyActionLabel: "Create your first job",
      };
    }

    return {
      workspaceEyebrow: "Freelancer",
      title: "Dashboard",
      subtitle:
        "Overview of assigned work, reviews, and payouts.",
      isLoading,
      isError,
      queueTitle: "Freelancer jobs",
      queueCountLabel: `${jobIds.length} total`,
      jobs,
      totalEscrow,
      disputedCount,
      activeCount,
      jobCount: jobs.length,
      counterpartyLabel: "Employer",
      emptyMessage: "No jobs assigned to you yet. When employers create escrow jobs for your wallet, they will appear here.",
      emptyActionHref: "/offers",
      emptyActionLabel: "Check your offers",
    };
  }, [
    activeView,
    employerJobs.isError,
    employerJobs.isLoading,
    employerJobs.jobIds,
    employerJobs.jobs,
    freelancerJobs.isError,
    freelancerJobs.isLoading,
    freelancerJobs.jobIds,
    freelancerJobs.jobs,
  ]);

  const walletChip = address ? shortAddr(address) : "N/A";
  const networkLabel = chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`;
  const usdtBalanceQuery = useReadContract({
    address: USDT_SEPOLIA_ADDRESS,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && chainId === 11155111),
      refetchInterval: API_POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const [employerPostingStats, setEmployerPostingStats] = useState({
    openPostings: 0,
    newProposals: 0,
  });
  const [freelancerProposalStats, setFreelancerProposalStats] = useState({
    activeApplications: 0,
    unreadReplies: 0,
  });
  const [notificationCount, setNotificationCount] = useState(0);

  const loadMarketplaceStats = useCallback(
    async (silent = false) => {
      if (!address) return;
      const session = getStoredAuthSession();
      if (!session || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
        return;
      }

      try {
        const tasks: Promise<unknown>[] = [
          fetchUnreadNotificationCount(session).then((value) =>
            setNotificationCount(value.count)
          ),
        ];

        if (showEmployerList) {
          tasks.push(
            fetchMyPostingStats(session).then((value) => setEmployerPostingStats(value))
          );
        }

        if (showFreelancerList) {
          tasks.push(
            fetchMyProposalStats(session).then((value) => setFreelancerProposalStats(value))
          );
        }

        await Promise.all(tasks);
      } catch {
        if (!silent) {
          setNotificationCount(0);
        }
      }
    },
    [address, showEmployerList, showFreelancerList]
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadMarketplaceStats(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadMarketplaceStats]);

  useVisibleInterval(
    () => void loadMarketplaceStats(true),
    API_POLL_INTERVAL_MS,
    Boolean(address)
  );

  const statCards = [
    {
      label: "Total jobs",
      value: activeConfig.jobCount,
      suffix: "",
      icon: BriefcaseBusiness,
      detail: `${activeConfig.queueCountLabel} in this workspace`,
      tone: isDarkTheme
        ? "bg-sky-400/10 text-sky-200"
        : "bg-sky-50 text-sky-700",
    },
    {
      label: "Active",
      value: activeConfig.activeCount,
      suffix: "",
      icon: TrendingUp,
      detail: "Funded, in progress, or review",
      tone: isDarkTheme
        ? "bg-emerald-400/10 text-emerald-200"
        : "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Disputes",
      value: activeConfig.disputedCount,
      suffix: "",
      icon: Scale,
      detail: activeConfig.disputedCount > 0 ? "Needs attention" : "No active disputes",
      tone: isDarkTheme
        ? "bg-rose-400/10 text-rose-200"
        : "bg-rose-50 text-rose-700",
    },
    {
      label: "Total escrow",
      value: formatUsdtValue(activeConfig.totalEscrow),
      suffix: " USDT",
      icon: CircleDollarSign,
      detail: "Value locked across listed jobs",
      tone: isDarkTheme
        ? "bg-blue-400/10 text-blue-200"
        : "bg-blue-50 text-blue-700",
    },
    {
      label: "Wallet balance",
      value: formatWalletUsdt(usdtBalanceQuery.data),
      suffix: " USDT",
      icon: Wallet,
      detail:
        chainId === 11155111
          ? usdtBalanceQuery.isLoading
            ? "Reading wallet balance"
            : usdtBalanceQuery.isError
              ? "Balance unavailable"
              : "Available in wallet"
          : "Switch to Sepolia",
      tone: isDarkTheme
        ? "bg-violet-400/10 text-violet-200"
        : "bg-violet-50 text-violet-700",
    },
  ];

  const marketplaceCards =
    activeView === "employer"
      ? [
          {
            label: "Open postings",
            value: employerPostingStats.openPostings,
            href: "/postings",
            linkLabel: "Manage postings",
          },
          {
            label: "New proposals",
            value: employerPostingStats.newProposals,
            href: "/postings",
            linkLabel: "Review applicants",
          },
        ]
      : [
          {
            label: "Active applications",
            value: freelancerProposalStats.activeApplications,
            href: "/applications",
            linkLabel: "Open applications",
          },
          {
            label: "Unread replies",
            value: Math.max(freelancerProposalStats.unreadReplies, notificationCount),
            href: "/applications",
            linkLabel: "Check conversations",
          },
        ];

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-6">
        {/* Hero */}
        <article className={`${panelClass} rounded-2xl px-6 py-6 lg:px-8 lg:py-7`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
                {activeConfig.workspaceEyebrow} workspace
              </p>
              <h1 className={`mt-2 text-3xl font-bold tracking-tight ${titleClass}`}>
                {profile?.displayName ? (
                  <>Welcome back, {profile.displayName}</>
                ) : (
                  <>Dashboard</>
                )}
              </h1>
              <p className={`mt-1.5 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
                {activeConfig.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`${chipClass} rounded-full px-3 py-1`}>{walletChip}</span>
              <span className={`${chipClass} rounded-full px-3 py-1`}>{networkLabel}</span>
            </div>
          </div>

          {showEmployerList && showFreelancerList ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                Workspace
              </span>
              <div
                className={`inline-flex rounded-full border p-0.5 text-xs font-semibold ${
                  isDarkTheme ? "border-white/12 bg-black/30" : "border-[#e1e4f0] bg-[#f4f5fb]"
                }`}
              >
                {(["employer", "freelancer"] as const).map((tab) => {
                  const selected = dualWorkspaceTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDualWorkspaceTab(tab)}
                      className={`rounded-full px-4 py-1.5 capitalize transition ${
                        selected
                          ? isDarkTheme
                            ? "bg-violet-500/25 text-violet-50"
                            : "bg-violet-100 text-violet-900"
                          : isDarkTheme
                            ? "text-white/65 hover:text-white"
                            : "text-[#5c6172] hover:text-[#242838]"
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </article>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {statCards.map((stat) => (
            <article
              key={stat.label}
              className={`${panelClass} rounded-2xl p-5 transition hover:-translate-y-0.5`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={`pt-1 text-xs font-semibold ${isDarkTheme ? "text-white/72" : "text-[#343949]"}`}>
                  {stat.label}
                </p>
                <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${stat.tone}`}>
                  <stat.icon size={16} />
                </span>
              </div>
              <p className={`mt-4 text-3xl font-semibold tabular-nums tracking-normal ${titleClass}`}>
                {stat.value}
                {stat.suffix ? (
                  <span className={`ml-1 text-xs font-semibold ${mutedTextClass}`}>{stat.suffix}</span>
                ) : null}
              </p>
              <p className={`mt-3 text-xs leading-5 ${mutedTextClass}`}>
                {stat.detail}
              </p>
            </article>
          ))}
        </div>

        {/* Jobs by Status — Visual Chart */}
        <div className="grid gap-4 sm:grid-cols-2">
          {marketplaceCards.map((card) => (
            <article key={card.label} className={`${panelClass} rounded-2xl p-5`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                Marketplace
              </p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className={`text-sm ${mutedTextClass}`}>{card.label}</p>
                  <p className={`mt-2 text-2xl font-bold tabular-nums ${titleClass}`}>
                    {card.value}
                  </p>
                </div>
                <Link
                  href={card.href}
                  className={`${actionChipClass} inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold`}
                >
                  {card.linkLabel}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
            Status breakdown
          </p>
          <h2 className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}>
            Jobs by status
          </h2>

          <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-12">
            <DonutChart jobs={activeConfig.jobs} isDark={isDarkTheme} />

            <div className="flex-1">
              {/* Horizontal bar legend */}
              <div className="grid gap-3">
                {([0, 1, 2, 3, 4, 5, 6] as EscrowJobStatus[]).map((s) => {
                  const count = activeConfig.jobs.filter((j) => j.status === s).length;
                  const pct = activeConfig.jobs.length > 0 ? (count / activeConfig.jobs.length) * 100 : 0;
                  const colors = isDarkTheme ? STATUS_COLORS[s] : STATUS_COLORS_LIGHT[s];

                  return (
                    <div key={s} className="group">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block size-2.5 rounded-full ${colors.dot}`} />
                          <span className={`text-xs font-medium ${isDarkTheme ? "text-white/75" : "text-[#3a3f54]"}`}>
                            {JOB_STATUS_LABEL[s]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs tabular-nums font-semibold ${titleClass}`}>{count}</span>
                          <span className={`text-[10px] tabular-nums ${tinyLabelClass}`}>
                            {pct > 0 ? `${pct.toFixed(0)}%` : "—"}
                          </span>
                        </div>
                      </div>
                      <div className={`h-1.5 w-full overflow-hidden rounded-full ${isDarkTheme ? "bg-white/[0.06]" : "bg-[#e8eaf3]"}`}>
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 0)}%`,
                            backgroundColor: STATUS_COLORS[s].ring,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </article>

        {/* Job Queue */}
        {(activeView === "employer" && showEmployerList) ||
        (activeView === "freelancer" && showFreelancerList) ? (
          <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Job queue</p>
                <h2 className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}>
                  {activeConfig.queueTitle}
                </h2>
              </div>
              <span className={`${actionChipClass} self-start rounded-full px-3.5 py-1.5 text-xs font-semibold tabular-nums`}>
                {activeConfig.queueCountLabel}
              </span>
            </div>

            {activeConfig.isLoading ? (
              <div className="mt-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-[88px] animate-pulse rounded-xl ${subtlePanelClass}`}
                  />
                ))}
              </div>
            ) : activeConfig.isError ? (
              <div className={`mt-6 flex items-center gap-3 rounded-xl border px-5 py-4 ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                <Scale size={18} />
                <p className="text-sm">Could not load jobs from contract. Please check your connection.</p>
              </div>
            ) : activeConfig.jobs.length === 0 ? (
              <div className={`mt-6 flex flex-col items-center gap-5 rounded-2xl py-14 ${subtlePanelClass}`}>
                <span className={`inline-flex size-16 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}>
                  <BriefcaseBusiness size={28} className="text-violet-400/60" />
                </span>
                <div className="text-center">
                  <p className={`text-sm font-medium ${titleClass}`}>No jobs yet</p>
                  <p className={`mt-1.5 max-w-sm text-sm ${mutedTextClass}`}>
                    {activeConfig.emptyMessage}
                  </p>
                </div>
                <Link
                  href={activeConfig.emptyActionHref}
                  className={`inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold transition ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                >
                  {activeConfig.emptyActionLabel}
                </Link>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {activeConfig.jobs.map((job) => (
                  <JobCard
                    counterpartyAddress={
                      activeView === "employer" ? job.freelancer : job.employer
                    }
                    counterpartyLabel={activeConfig.counterpartyLabel}
                    job={job}
                    key={`${activeView}-${job.id.toString()}`}
                    mode={theme}
                  />
                ))}
              </div>
            )}
          </article>
        ) : null}
      </section>
    </div>
  );
}
