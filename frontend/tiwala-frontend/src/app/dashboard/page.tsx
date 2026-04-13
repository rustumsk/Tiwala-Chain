"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  FilePlus2,
  FileText,
  Scale,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import JobCard from "@/components/jobs/job-card";
import { useEmployerJobs, useFreelancerJobs } from "@/hooks/use-escrow-jobs";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import {
  JOB_STATUS_LABEL,
  type EscrowJobStatus,
} from "@/lib/contract";
import { getStoredProfile, type LocalUserProfile } from "@/lib/profile";
import type { EscrowJob } from "@/types";

type DashboardView = "employer" | "freelancer";


function formatUsdtValue(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function countJobsByStatuses(jobs: EscrowJob[], statuses: number[]) {
  return jobs.filter((job) => statuses.includes(job.status)).length;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
        jobCount: jobs.length,
        counterpartyLabel: "Freelancer",
        emptyMessage: "You haven't created any escrow jobs yet. Start by creating your first job offer.",
        emptyActionHref: "/jobs/create",
        emptyActionLabel: "Create your first job",
        quickActions: [
          {
            href: "/jobs/create",
            label: "Create job",
            description: "Open a new escrow-backed engagement.",
            icon: FilePlus2,
          },
          {
            href: "/contracts/create",
            label: "Build contract",
            description: "Draft and evaluate terms before publishing.",
            icon: FileText,
          },
          {
            href: "/jobs",
            label: "All jobs",
            description: "Open your full employer job list.",
            icon: BriefcaseBusiness,
          },
        ],
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
      jobCount: jobs.length,
      counterpartyLabel: "Employer",
      emptyMessage: "No jobs assigned to you yet. When employers create escrow jobs for your wallet, they will appear here.",
      emptyActionHref: "/offers",
      emptyActionLabel: "Check your offers",
      quickActions: [
        {
          href: "/jobs",
          label: "View jobs",
          description: "Work through your assigned escrow queue.",
          icon: BriefcaseBusiness,
        },
        {
          href: "/settings/profile",
          label: "Profile settings",
          description: "Update the identity employers see on chain.",
          icon: Settings,
        },
        {
          href: "/public/contracts",
          label: "Verify contract",
          description: "Paste any contract and check fairness.",
          icon: FileText,
        },
      ],
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

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            {activeConfig.workspaceEyebrow}
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            {activeConfig.title}
            {profile?.displayName ? (
              <span className={`font-normal ${mutedTextClass}`}>
                {" "}
                · {profile.displayName}
              </span>
            ) : null}
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            {activeConfig.subtitle}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`${chipClass} rounded-full px-3 py-1`}>Wallet: {walletChip}</span>
            <span className={`${chipClass} rounded-full px-3 py-1`}>
              Network: {networkLabel}
            </span>
            <span className={`${actionChipClass} rounded-full px-3 py-1`}>
              {activeConfig.workspaceEyebrow}
            </span>
          </div>

          {showEmployerList && showFreelancerList ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                      className={`rounded-full px-3 py-1.5 capitalize transition ${
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

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              label: "Your jobs",
              value: activeConfig.jobCount,
              icon: ShieldCheck,
            },
            {
              label: "Active disputes",
              value: activeConfig.disputedCount,
              icon: Scale,
            },
            {
              label: "Total escrow",
              value: `${formatUsdtValue(activeConfig.totalEscrow)} USDT`,
              icon: Users,
            },
          ].map((stat) => (
            <article key={stat.label} className={`${panelClass} rounded-xl p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                  {stat.label}
                </p>
                <span
                  className={`${subtlePanelClass} inline-flex size-9 items-center justify-center rounded-lg`}
                >
                  <stat.icon size={16} className="text-violet-400" />
                </span>
              </div>
              <p className={`mt-3 text-2xl font-semibold tabular-nums ${titleClass}`}>
                {stat.value}
              </p>
            </article>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                  Quick actions
                </p>
                <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
                  {activeView === "employer" ? "Employer tools" : "Freelancer tools"}
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {activeConfig.quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`${subtlePanelClass} flex items-center gap-3 rounded-xl p-4 transition hover:border-violet-300/40`}
                >
                  <span
                    className={`${actionChipClass} inline-flex size-10 shrink-0 items-center justify-center rounded-lg`}
                  >
                    <action.icon size={17} />
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${titleClass}`}>{action.label}</p>
                    <p className={`mt-0.5 text-xs ${mutedTextClass}`}>{action.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                  Status breakdown
                </p>
                <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
                  Jobs by status
                </h2>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([0, 1, 2, 3, 4, 5, 6] as EscrowJobStatus[]).map((s) => {
                const count = activeConfig.jobs.filter((j) => j.status === s).length;
                return (
                  <div key={s} className={`${subtlePanelClass} rounded-xl p-3 text-center`}>
                    <p className={`text-xl font-semibold tabular-nums ${titleClass}`}>{count}</p>
                    <p className={`mt-1 text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                      {JOB_STATUS_LABEL[s]}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>
        </div>

        {(activeView === "employer" && showEmployerList) ||
        (activeView === "freelancer" && showFreelancerList) ? (
          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Job queue</p>
            <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
              {activeConfig.queueTitle}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`${chipClass} rounded-full px-3 py-1 text-xs`}>
                {activeConfig.queueCountLabel}
              </span>
            </div>

            {activeConfig.isLoading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className={`h-24 animate-pulse rounded-xl ${subtlePanelClass}`}
                  />
                ))}
              </div>
            ) : activeConfig.isError ? (
              <p className={`mt-4 text-sm ${isDarkTheme ? "text-red-300" : "text-red-600"}`}>
                Could not load jobs from contract.
              </p>
            ) : activeConfig.jobs.length === 0 ? (
              <div className={`mt-4 flex flex-col items-center gap-4 rounded-xl py-10 ${subtlePanelClass}`}>
                <BriefcaseBusiness size={36} className="text-violet-400/50" />
                <p className={`max-w-sm text-center text-sm ${mutedTextClass}`}>
                  {activeConfig.emptyMessage}
                </p>
                <Link
                  href={activeConfig.emptyActionHref}
                  className={`inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold transition ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                >
                  {activeConfig.emptyActionLabel}
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
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
