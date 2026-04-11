"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  FilePlus2,
  FileText,
  LineChart,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import type { Address, Hex } from "viem";
import { useAppTheme } from "@/components/layout/theme-context";
import JobCard from "@/components/jobs/job-card";
import {
  useEmployerJobs,
  useFreelancerJobs,
} from "@/hooks/use-escrow-jobs";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import { getStoredProfile, type LocalUserProfile } from "@/lib/profile";
import type { EscrowJob } from "@/types";

type DashboardView = "employer" | "freelancer";

type StageDefinition = {
  label: string;
  description: string;
  statuses: number[];
};

const ESCROW_STAGES: StageDefinition[] = [
  { label: "Created", description: "Terms recorded", statuses: [0] },
  { label: "Funded", description: "USDT secured", statuses: [1] },
  { label: "In Progress", description: "Work underway", statuses: [2] },
  { label: "Under Review", description: "Awaiting approval", statuses: [3] },
  { label: "Released", description: "Payout settled", statuses: [5] },
];

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

function getActiveCount(jobs: EscrowJob[]) {
  return jobs.filter((job) => job.status !== 5 && job.status !== 6).length;
}

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { theme } = useAppTheme();
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

  const shortWallet = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "Not connected";

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
    const activeJobs = getActiveCount(jobs);
    const createdCount = countJobsByStatuses(jobs, [0]);
    const fundedCount = countJobsByStatuses(jobs, [1]);
    const inProgressCount = countJobsByStatuses(jobs, [2]);
    const submittedCount = countJobsByStatuses(jobs, [3]);
    const disputedCount = countJobsByStatuses(jobs, [4]);
    const completedCount = countJobsByStatuses(jobs, [5]);
    const refundedCount = countJobsByStatuses(jobs, [6]);
    const completionRate = jobs.length === 0 ? 0 : Math.round((completedCount / jobs.length) * 100);

    if (activeView === "employer") {
      return {
        label: "Employer",
        eyebrow: "Escrow Dashboard",
        heading: "Track funded work, approvals, and release risk.",
        description:
          "This view is tuned for escrow operations: what is already secured, what needs your approval, and which engagements are still moving through delivery.",
        isLoading,
        isError,
        isPreview,
        queueTitle: "Employer jobs",
        queueCountLabel: isPreview ? `${jobs.length} preview` : `${liveJobIds.length} total`,
        jobs,
        totalEscrow,
        activeJobs,
        counterpartyLabel: "Freelancer",
        totalEscrowLabel: "Escrow Locked",
        stageCounts: {
          created: createdCount,
          funded: fundedCount,
          inProgress: inProgressCount,
          submitted: submittedCount,
          disputed: disputedCount,
          completed: completedCount,
          refunded: refundedCount,
        },
        focus: {
          title:
            submittedCount > 0
              ? "Review submitted work"
              : createdCount > 0
                ? "Fund newly created jobs"
                : "Monitor active deliveries",
          description:
            submittedCount > 0
              ? `${submittedCount} job${submittedCount === 1 ? "" : "s"} are ready for approval and release.`
              : createdCount > 0
                ? `${createdCount} job${createdCount === 1 ? "" : "s"} still need funding before work can progress.`
                : "Your active escrow is moving. Stay on top of delivery and settlement timing.",
          count: submittedCount > 0 ? submittedCount : createdCount > 0 ? createdCount : activeJobs,
          tone:
            submittedCount > 0
              ? "border-amber-400/20 bg-amber-500/10 text-amber-100"
              : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
        },
        quickActions: [
          {
            href: "/jobs/create",
            label: "Create Job",
            description: "Open a new escrow-backed engagement.",
            icon: FilePlus2,
          },
          {
            href: "/contracts/create",
            label: "Build Contract",
            description: "Draft and evaluate terms before publishing.",
            icon: FileText,
          },
          {
            href: "/jobs",
            label: "Review Jobs",
            description: "Inspect every employer-side record in one queue.",
            icon: BriefcaseBusiness,
          },
        ],
        supportCards: [
          {
            title: "Awaiting Release",
            value: submittedCount,
            caption: "Submitted jobs waiting on your approval.",
            icon: Clock3,
          },
          {
            title: "Counterparties",
            value: jobs.length,
            caption: "Freelancer relationships being coordinated through escrow.",
            icon: ShieldCheck,
          },
          {
            title: "Completion Rate",
            value: `${completionRate}%`,
            caption: "Jobs that have already moved to settled payout.",
            icon: Scale,
          },
        ],
      };
    }

    return {
      label: "Freelancer",
      eyebrow: "Escrow Workbench",
      heading: "Track deliverables, reviews, and payout timing.",
      description:
        "This view centers the payout path: which jobs are funded, what you should deliver next, and what is already sitting with the employer for approval.",
      isLoading,
      isError,
      isPreview,
      queueTitle: "Freelancer jobs",
      queueCountLabel: isPreview ? `${jobs.length} preview` : `${liveJobIds.length} total`,
      jobs,
      totalEscrow,
      activeJobs,
      counterpartyLabel: "Employer",
      totalEscrowLabel: "Payout in Escrow",
      stageCounts: {
        created: createdCount,
        funded: fundedCount,
        inProgress: inProgressCount,
        submitted: submittedCount,
        disputed: disputedCount,
        completed: completedCount,
        refunded: refundedCount,
      },
      focus: {
        title:
          inProgressCount > 0
            ? "Advance active delivery"
            : submittedCount > 0
              ? "Await employer review"
              : fundedCount > 0
                ? "Start funded jobs"
                : "Keep your profile ready",
        description:
          inProgressCount > 0
            ? `${inProgressCount} job${inProgressCount === 1 ? "" : "s"} are in progress and ready to move toward submission.`
            : submittedCount > 0
              ? `${submittedCount} submission${submittedCount === 1 ? "" : "s"} are waiting on employer approval.`
              : fundedCount > 0
                ? `${fundedCount} funded job${fundedCount === 1 ? "" : "s"} can be started from the escrow queue.`
                : "No immediate actions are blocking payout. Keep your profile current and monitor new work.",
        count:
          inProgressCount > 0
            ? inProgressCount
            : submittedCount > 0
              ? submittedCount
              : fundedCount,
        tone:
          submittedCount > 0
            ? "border-amber-400/20 bg-amber-500/10 text-amber-100"
            : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
      },
      quickActions: [
        {
          href: "/jobs",
          label: "View Jobs",
          description: "Work through your assigned escrow queue.",
          icon: BriefcaseBusiness,
        },
        {
          href: "/settings/profile",
          label: "Profile Settings",
          description: "Update the identity employers see on chain.",
          icon: Settings,
        },
        {
          href: "/public/contracts",
          label: "Verify Contract",
          description: "Paste any contract and check fairness.",
          icon: FileText,
        },
      ],
      supportCards: [
        {
          title: "Ready to Submit",
          value: inProgressCount,
          caption: "Jobs currently moving toward delivery.",
          icon: Clock3,
        },
        {
          title: "Awaiting Review",
          value: submittedCount,
          caption: "Submitted work sitting with the employer.",
          icon: ShieldCheck,
        },
        {
          title: "Completion Rate",
          value: `${completionRate}%`,
          caption: "Assigned jobs that have already been paid out.",
          icon: Scale,
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

  const isDarkTheme = theme === "dark";
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
    ? "border border-violet-300/40 bg-violet-500/18 text-violet-100"
    : "border border-violet-200 bg-violet-50 text-violet-700";
  const focusToneClass =
    activeConfig.focus.title.toLowerCase().includes("review") ||
    activeConfig.focus.title.toLowerCase().includes("submitted")
      ? isDarkTheme
        ? "border border-amber-300/28 bg-amber-500/12 text-amber-100"
        : "border border-amber-200 bg-amber-50 text-amber-900"
      : isDarkTheme
        ? "border border-violet-300/28 bg-violet-500/12 text-violet-100"
        : "border border-violet-200 bg-violet-50 text-violet-900";

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <section className={`${panelClass} px-6 py-6 lg:px-8 lg:py-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
                <Sparkles size={12} />
                <span>{activeConfig.eyebrow}</span>
              </div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Welcome{profile ? `, ${profile.displayName}` : ""}.
              </h1>
              <p className={`max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                {activeConfig.heading}
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  isDarkTheme ? "bg-white/[0.03]" : "bg-[#f4f3ff]"
                }`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                  <Wallet size={16} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    Wallet
                  </p>
                  <p className={`truncate text-xs font-medium ${titleClass}`}>{shortWallet}</p>
                </div>
              </div>

              <div
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  isDarkTheme ? "bg-emerald-500/10" : "bg-emerald-50"
                }`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-100">
                  <Activity size={16} />
                </div>
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    Active Jobs
                  </p>
                  <p className={`text-lg font-semibold tabular-nums ${titleClass}`}>
                    {activeConfig.activeJobs}
                  </p>
                </div>
              </div>

              <div
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  isDarkTheme ? "bg-sky-500/10" : "bg-sky-50"
                }`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-100">
                  <LineChart size={16} />
                </div>
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    {activeConfig.totalEscrowLabel}
                  </p>
                  <p className={`text-lg font-semibold tabular-nums ${titleClass}`}>
                    {formatUsdtValue(activeConfig.totalEscrow)} USDT
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`${chipClass} px-2.5 py-1.5`}>
              Network: {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
            </span>
            {activeConfig.isPreview ? (
              <span className={`${actionChipClass} px-2.5 py-1.5`}>Preview queue active</span>
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
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2" />
          )}
        </section>

        <section className={panelClass}>
          <div className={`flex items-center justify-between border-b px-6 py-3 lg:px-8 ${isDarkTheme ? "border-white/10" : "border-[#eceef5]"}`}>
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Escrow Rail</p>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>
                Lifecycle state across the current {activeConfig.label.toLowerCase()} queue.
              </p>
            </div>
            <span className={`${isDarkTheme ? "border-red-300/25 bg-red-500/10 text-red-100" : "border border-red-200 bg-red-50 text-red-700"} px-3 py-1 text-xs`}>
              {activeConfig.stageCounts.disputed} disputed · {activeConfig.stageCounts.refunded} refunded
            </span>
          </div>

          <div className="grid gap-0 md:grid-cols-5">
            {ESCROW_STAGES.map((stage, index) => {
              const count = countJobsByStatuses(activeConfig.jobs, stage.statuses);
              return (
                <div
                  key={stage.label}
                  className={`px-6 py-4 last:border-r-0 lg:px-8 ${isDarkTheme ? "border-r border-white/10" : "border-r border-[#eceef5]"}`}
                >
                  <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>0{index + 1}</p>
                  <p className={`mt-2 text-2xl font-semibold tabular-nums ${titleClass}`}>{count}</p>
                  <p className={`mt-2 text-sm font-medium ${titleClass}`}>{stage.label}</p>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>{stage.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
          <section className={`${panelClass} p-6 lg:p-7`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Action Queue</p>
                <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                  {activeConfig.focus.title}
                </h2>
              </div>
              <span className={`${actionChipClass} inline-flex size-10 items-center justify-center`}>
                <ShieldCheck size={17} />
              </span>
            </div>

            <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>{activeConfig.focus.description}</p>

            <div className={`${focusToneClass} mt-4 px-4 py-4`}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-current/80">Jobs in focus</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-current">{activeConfig.focus.count}</p>
                </div>
                <ArrowRight size={18} className="text-current/80" />
              </div>
            </div>

            <div className={`${subtlePanelClass} mt-4 divide-y ${isDarkTheme ? "divide-white/10" : "divide-[#eceef5]"}`}>
              {activeConfig.supportCards.map(({ title, value, caption, icon: Icon }) => (
                <div key={title} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>{title}</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${titleClass}`}>{value}</p>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>{caption}</p>
                  </div>
                  <span className={`${chipClass} inline-flex size-9 items-center justify-center`}>
                    <Icon size={15} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${panelClass} p-6 lg:p-7`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Workspace Context</p>
                <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                  Read before opening jobs
                </h2>
              </div>
              <span className={`${chipClass} inline-flex size-10 items-center justify-center`}>
                <Wallet size={16} />
              </span>
            </div>

            <div className={`${subtlePanelClass} mt-4 grid gap-0 divide-y md:grid-cols-2 md:divide-x md:divide-y-0 ${isDarkTheme ? "divide-white/10" : "divide-[#eceef5]"}`}>
              <div className="px-4 py-4">
                <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Trust Signal</p>
                <p className={`mt-2 text-lg font-semibold ${titleClass}`}>Escrow-backed delivery</p>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  Every job is anchored to a funding-review-release lifecycle.
                </p>
              </div>
              <div className="px-4 py-4">
                <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Primary Counterparty</p>
                <p className={`mt-2 text-lg font-semibold ${titleClass}`}>{activeConfig.counterpartyLabel} wallets</p>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  Open rows to continue escrow actions with complete on-chain context.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeConfig.quickActions.map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className={`${chipClass} inline-flex items-center gap-2 px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {(activeView === "employer" && showEmployerList) ||
        (activeView === "freelancer" && showFreelancerList) ? (
          <section className={`${panelClass} p-6 lg:p-7`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Job Queue</p>
                <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>{activeConfig.queueTitle}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${chipClass} px-3 py-1 text-xs`}>{activeConfig.queueCountLabel}</span>
                {activeConfig.isPreview ? (
                  <span className={`${actionChipClass} px-3 py-1 text-xs`}>Preview mode</span>
                ) : null}
              </div>
            </div>

            {activeConfig.isPreview ? (
              <p className={`mb-4 text-sm ${mutedTextClass}`}>
                Live jobs are empty, so preview rows are shown for visual validation.
              </p>
            ) : null}

            {activeConfig.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-2">
                        <div className="h-3 w-40 rounded-full bg-white/10" />
                        <div className="h-2 w-24 rounded-full bg-white/7" />
                      </div>
                      <div className="h-6 w-24 rounded-full bg-white/8" />
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-2 w-full rounded-full bg-white/8" />
                      <div className="h-2 w-5/6 rounded-full bg-white/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeConfig.isError ? (
              <p className="text-sm text-red-500">Could not load jobs from contract.</p>
            ) : (
              <div className="space-y-2">
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
          </section>
        ) : null}
      </section>
    </div>
  );
}
