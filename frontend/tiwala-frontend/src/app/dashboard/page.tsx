"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { Address, Hex } from "viem";
import { useAppTheme } from "@/components/layout/theme-context";
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

function asAddress(value: string) {
  return value as Address;
}

function asHex(value: string) {
  return value as Hex;
}

const MOCK_EMPLOYER_JOBS: EscrowJob[] = [
  {
    id: BigInt(1201),
    employer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    freelancer: asAddress("0xA13e5d77c3bF27D1F5A9C7b4d3E9A1c9F0B451A2"),
    amount: BigInt("3250000000"),
    contractHash: asHex("0x1111111111111111111111111111111111111111111111111111111111111111"),
    status: 3,
  },
  {
    id: BigInt(1202),
    employer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    freelancer: asAddress("0xB43d0a89E5cC1177aD3B9f8A2e2D4b9c6B3d7F10"),
    amount: BigInt("1850000000"),
    contractHash: asHex("0x2222222222222222222222222222222222222222222222222222222222222222"),
    status: 2,
  },
  {
    id: BigInt(1203),
    employer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    freelancer: asAddress("0xC9488d2B317A2E4E7f5A1E4d7c9A8E1a3C27B5D1"),
    amount: BigInt("4600000000"),
    contractHash: asHex("0x3333333333333333333333333333333333333333333333333333333333333333"),
    status: 1,
  },
  {
    id: BigInt(1204),
    employer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    freelancer: asAddress("0xD2192C4d6A4d1A1eC1A4C1D9a8d3B2f1E7c5A903"),
    amount: BigInt("900000000"),
    contractHash: asHex("0x4444444444444444444444444444444444444444444444444444444444444444"),
    status: 5,
  },
];

const MOCK_FREELANCER_JOBS: EscrowJob[] = [
  {
    id: BigInt(2201),
    employer: asAddress("0x7A4d2E1a1cA1B5e4D2f6b9A1C3d5E7F8a0B1C2D3"),
    freelancer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    amount: BigInt("2400000000"),
    contractHash: asHex("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    status: 2,
  },
  {
    id: BigInt(2202),
    employer: asAddress("0x8B1e4d7A3c5E2f9D1A2b3C4d5e6F7a8B9c0D1E2F"),
    freelancer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    amount: BigInt("1150000000"),
    contractHash: asHex("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    status: 3,
  },
  {
    id: BigInt(2203),
    employer: asAddress("0x9C6f3B1a4E7d2A9b5C1d8E2a3b4C6d7E8f9A0B1C"),
    freelancer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    amount: BigInt("3900000000"),
    contractHash: asHex("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"),
    status: 1,
  },
  {
    id: BigInt(2204),
    employer: asAddress("0xA3d5F7b1C9e2D4a6B8c1E3f5A7d9C2b4E6f8A0D1"),
    freelancer: asAddress("0x5f41aB2f1d0E9C5D4c5B6eD7a8C9b0D1e2F34567"),
    amount: BigInt("725000000"),
    contractHash: asHex("0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"),
    status: 5,
  },
];

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
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { theme, isDarkTheme } = useAppTheme();
  const profile = useMemo<LocalUserProfile | null>(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase()
      ? existing
      : null;
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected || !address) {
      router.replace("/");
      return;
    }

    if (!profile) {
      router.replace("/onboarding");
    }
  }, [address, isConnected, profile, router]);

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
    const liveJobs = activeView === "employer" ? employerJobs.jobs : freelancerJobs.jobs;
    const isLoading =
      activeView === "employer" ? employerJobs.isLoading : freelancerJobs.isLoading;
    const isError =
      activeView === "employer" ? employerJobs.isError : freelancerJobs.isError;
    const liveJobIds =
      activeView === "employer" ? employerJobs.jobIds : freelancerJobs.jobIds;
    const previewJobs =
      activeView === "employer" ? MOCK_EMPLOYER_JOBS : MOCK_FREELANCER_JOBS;
    const isPreview = !isLoading && !isError && liveJobs.length === 0;
    const jobs = isPreview ? previewJobs : liveJobs;
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
          "Overview of your escrow jobs, funding, and releases — same layout as the admin view, scoped to your wallet.",
        isLoading,
        isError,
        isPreview,
        queueTitle: "Employer jobs",
        queueCountLabel: isPreview ? `${jobs.length} preview` : `${liveJobIds.length} total`,
        jobs,
        totalEscrow,
        disputedCount,
        jobCount: jobs.length,
        counterpartyLabel: "Freelancer",
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
        "Overview of assigned work, reviews, and payouts — aligned with the admin dashboard style.",
      isLoading,
      isError,
      isPreview,
      queueTitle: "Freelancer jobs",
      queueCountLabel: isPreview ? `${jobs.length} preview` : `${liveJobIds.length} total`,
      jobs,
      totalEscrow,
      disputedCount,
      jobCount: jobs.length,
      counterpartyLabel: "Employer",
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
            {activeConfig.isPreview ? (
              <span className={`${actionChipClass} rounded-full px-3 py-1`}>Preview</span>
            ) : null}
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
              {activeConfig.isPreview ? (
                <span className={`${actionChipClass} rounded-full px-3 py-1 text-xs`}>
                  Preview mode
                </span>
              ) : null}
            </div>

            {activeConfig.isPreview ? (
              <p className={`mt-4 text-sm ${mutedTextClass}`}>
                Live jobs are empty, so preview rows are shown for visual validation.
              </p>
            ) : null}

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
              <p className={`mt-4 text-sm ${mutedTextClass}`}>No jobs in this workspace yet.</p>
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
