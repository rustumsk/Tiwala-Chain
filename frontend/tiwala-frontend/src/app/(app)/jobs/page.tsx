"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { BriefcaseBusiness } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import JobCard from "@/components/jobs/job-card";
import { useEmployerJobs, useFreelancerJobs } from "@/hooks/use-escrow-jobs";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import { getStoredProfile } from "@/lib/profile";

const JOB_TAB_FILTERS = ["all", "ongoing", "done", "disputed"] as const;
type JobTabFilter = (typeof JOB_TAB_FILTERS)[number];

function categorizeStatus(status: number) {
  if (status === 4) return "disputed" as const;
  if (status === 5 || status === 6) return "done" as const;
  return "ongoing" as const;
}

function FilterBar({
  active,
  onChange,
  isDark,
}: {
  active: JobTabFilter;
  onChange: (v: JobTabFilter) => void;
  isDark: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(
        [
          { key: "all", label: "All" },
          { key: "ongoing", label: "Ongoing" },
          { key: "done", label: "Done" },
          { key: "disputed", label: "Disputed" },
        ] as const
      ).map((opt) => {
        const selected = active === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              selected
                ? isDark
                  ? "border border-violet-300/60 bg-violet-500/25 text-violet-50"
                  : "border border-violet-400 bg-violet-100 text-violet-800"
                : isDark
                  ? "border border-white/10 bg-white/[0.02] text-white/65 hover:border-violet-300/30 hover:bg-violet-500/10"
                  : "border border-[#e1e4f0] bg-white text-[#555a6b] hover:border-violet-300 hover:bg-violet-50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function JobsPage() {
  const { address, isConnected } = useAccount();
  const {
    theme,
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
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase()
      ? existing
      : null;
  }, [address, isConnected]);

  const showEmployerList =
    profile?.role === "employer" || profile?.role === "both";
  const showFreelancerList =
    profile?.role === "freelancer" || profile?.role === "both";

  const employerJobs = useEmployerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showEmployerList),
  });

  const freelancerJobs = useFreelancerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showFreelancerList),
  });

  const [employerFilter, setEmployerFilter] =
    usePersistedSessionString<JobTabFilter>(
      "tiwala:jobs:employerFilter",
      "all",
      JOB_TAB_FILTERS
    );
  const [freelancerFilter, setFreelancerFilter] =
    usePersistedSessionString<JobTabFilter>(
      "tiwala:jobs:freelancerFilter",
      "all",
      JOB_TAB_FILTERS
    );

  const filteredEmployer = employerJobs.jobs.filter(
    (job) =>
      employerFilter === "all" || categorizeStatus(job.status) === employerFilter
  );
  const filteredFreelancer = freelancerJobs.jobs.filter(
    (job) =>
      freelancerFilter === "all" ||
      categorizeStatus(job.status) === freelancerFilter
  );

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-6">
        {/* Hero */}
        <article className={`${panelClass} rounded-2xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job workspace
          </p>
          <h1
            className={`mt-2 text-3xl font-bold tracking-tight ${titleClass}`}
          >
            Escrow jobs
          </h1>
          <p className={`mt-1.5 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Review your on-chain escrow jobs by role. Open each one for full
            details, deliverables, and actions.
          </p>
        </article>

        {/* Employer section */}
        {showEmployerList ? (
          <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
                >
                  Employer queue
                </p>
                <h2
                  className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}
                >
                  Employer jobs
                </h2>
              </div>
              <span
                className={`${actionChipClass} self-start rounded-full px-3.5 py-1.5 text-xs font-semibold tabular-nums`}
              >
                {filteredEmployer.length} of {employerJobs.jobIds.length}
              </span>
            </div>

            <div className="mt-5">
              <FilterBar
                active={employerFilter}
                onChange={setEmployerFilter}
                isDark={isDarkTheme}
              />
            </div>

            {employerJobs.isLoading ? (
              <div className="mt-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-[88px] animate-pulse rounded-xl ${subtlePanelClass}`}
                  />
                ))}
              </div>
            ) : employerJobs.isError ? (
              <div
                className={`mt-6 rounded-xl border px-5 py-4 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
              >
                Could not load employer jobs from contract.
              </div>
            ) : filteredEmployer.length === 0 ? (
              <div
                className={`mt-6 flex flex-col items-center gap-5 rounded-2xl py-14 ${subtlePanelClass}`}
              >
                <span
                  className={`inline-flex size-14 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}
                >
                  <BriefcaseBusiness
                    size={24}
                    className="text-violet-400/60"
                  />
                </span>
                <p className={`text-sm ${mutedTextClass}`}>
                  {employerJobs.jobs.length === 0
                    ? "No employer jobs found."
                    : "No jobs match this filter."}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {filteredEmployer.map((job) => (
                  <JobCard
                    key={`employer-${job.id.toString()}`}
                    job={job}
                    counterpartyAddress={job.freelancer}
                    counterpartyLabel="Freelancer"
                    mode={theme}
                  />
                ))}
              </div>
            )}
          </article>
        ) : null}

        {/* Freelancer section */}
        {showFreelancerList ? (
          <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
                >
                  Freelancer queue
                </p>
                <h2
                  className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}
                >
                  Freelancer jobs
                </h2>
              </div>
              <span
                className={`${actionChipClass} self-start rounded-full px-3.5 py-1.5 text-xs font-semibold tabular-nums`}
              >
                {filteredFreelancer.length} of {freelancerJobs.jobIds.length}
              </span>
            </div>

            <div className="mt-5">
              <FilterBar
                active={freelancerFilter}
                onChange={setFreelancerFilter}
                isDark={isDarkTheme}
              />
            </div>

            {freelancerJobs.isLoading ? (
              <div className="mt-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-[88px] animate-pulse rounded-xl ${subtlePanelClass}`}
                  />
                ))}
              </div>
            ) : freelancerJobs.isError ? (
              <div
                className={`mt-6 rounded-xl border px-5 py-4 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
              >
                Could not load freelancer jobs from contract.
              </div>
            ) : filteredFreelancer.length === 0 ? (
              <div
                className={`mt-6 flex flex-col items-center gap-5 rounded-2xl py-14 ${subtlePanelClass}`}
              >
                <span
                  className={`inline-flex size-14 items-center justify-center rounded-2xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}
                >
                  <BriefcaseBusiness
                    size={24}
                    className="text-violet-400/60"
                  />
                </span>
                <p className={`text-sm ${mutedTextClass}`}>
                  {freelancerJobs.jobs.length === 0
                    ? "No freelancer jobs found."
                    : "No jobs match this filter."}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {filteredFreelancer.map((job) => (
                  <JobCard
                    key={`freelancer-${job.id.toString()}`}
                    job={job}
                    counterpartyAddress={job.employer}
                    counterpartyLabel="Employer"
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
