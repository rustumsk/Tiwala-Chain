"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useAppTheme } from "@/components/layout/theme-context";
import JobCard from "@/components/jobs/job-card";
import { useEmployerJobs, useFreelancerJobs } from "@/hooks/use-escrow-jobs";
import { getStoredProfile } from "@/lib/profile";

export default function JobsPage() {
  const { address, isConnected } = useAccount();
  const { theme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase() ? existing : null;
  }, [address, isConnected]);

  const showEmployerList = profile?.role === "employer";
  const showFreelancerList = profile?.role === "freelancer";

  const employerJobs = useEmployerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showEmployerList),
  });

  const freelancerJobs = useFreelancerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showFreelancerList),
  });

  const isDarkTheme = theme === "dark";
  const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const tableBorderClass = isDarkTheme ? "border-b border-white/10" : "border-b border-[#eceef5]";

  const [employerFilter, setEmployerFilter] = useState<"all" | "ongoing" | "done" | "disputed">("all");
  const [freelancerFilter, setFreelancerFilter] = useState<"all" | "ongoing" | "done" | "disputed">("all");

  const categorizeStatus = (status: number) => {
    // EscrowJobStatus: 0 Created, 1 Funded, 2 Work, 3 Review, 4 Disputed, 5 Released, 6 Refunded
    if (status === 4) return "disputed" as const;
    if (status === 5 || status === 6) return "done" as const;
    return "ongoing" as const;
  };

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job workspace
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Escrow jobs by role
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Review your escrow jobs by role and open each one for full on-chain details.
          </p>
        </article>

        {showEmployerList ? (
          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Employer queue</p>
                <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                  Employer jobs
                </h2>
              </div>
              <span className={`text-xs ${mutedTextClass}`}>{employerJobs.jobIds.length} total</span>
            </div>

            {employerJobs.isLoading ? (
              <p className={`text-sm ${mutedTextClass}`}>Loading employer jobs...</p>
            ) : employerJobs.isError ? (
              <p className={`text-sm ${isDarkTheme ? "text-red-300" : "text-red-600"}`}>
                Could not load employer jobs from contract.
              </p>
            ) : employerJobs.jobs.length === 0 ? (
              <p className={`text-sm ${mutedTextClass}`}>No employer jobs found.</p>
            ) : (
              <div className="space-y-3">
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  {[
                    { key: "all", label: "All" },
                    { key: "ongoing", label: "Ongoing" },
                    { key: "done", label: "Done" },
                    { key: "disputed", label: "Disputed" },
                  ].map((opt) => {
                    const active = employerFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setEmployerFilter(opt.key as "all" | "ongoing" | "done" | "disputed")
                        }
                        className={`rounded-full px-3 py-1 font-medium transition ${
                          active
                            ? isDarkTheme
                              ? "border border-violet-300/60 bg-violet-500/25 text-violet-50"
                              : "border border-violet-400 bg-violet-100 text-violet-800"
                            : isDarkTheme
                            ? "border border-white/12 bg-white/[0.02] text-white/70 hover:border-violet-300/40 hover:bg-violet-500/15"
                            : "border border-[#e1e4f0] bg-white text-[#555a6b] hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className={`hidden grid-cols-[0.9fr_1.2fr_1fr_0.9fr_auto] gap-4 px-4 pb-3 text-[11px] uppercase tracking-[0.16em] lg:grid ${tableBorderClass}`}>
                  <span className={tinyLabelClass}>Job</span>
                  <span className={tinyLabelClass}>Freelancer</span>
                  <span className={tinyLabelClass}>Escrow amount</span>
                  <span className={tinyLabelClass}>Status</span>
                  <span className={`text-right ${tinyLabelClass}`}>Action</span>
                </div>
                {employerJobs.jobs
                  .filter((job) => {
                    if (employerFilter === "all") return true;
                    const cat = categorizeStatus(job.status);
                    return cat === employerFilter;
                  })
                  .map((job) => (
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

        {showFreelancerList ? (
          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Freelancer queue</p>
                <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                  Freelancer jobs
                </h2>
              </div>
              <span className={`text-xs ${mutedTextClass}`}>{freelancerJobs.jobIds.length} total</span>
            </div>

            {freelancerJobs.isLoading ? (
              <p className={`text-sm ${mutedTextClass}`}>Loading freelancer jobs...</p>
            ) : freelancerJobs.isError ? (
              <p className={`text-sm ${isDarkTheme ? "text-red-300" : "text-red-600"}`}>
                Could not load freelancer jobs from contract.
              </p>
            ) : freelancerJobs.jobs.length === 0 ? (
              <p className={`text-sm ${mutedTextClass}`}>No freelancer jobs found.</p>
            ) : (
              <div className="space-y-3">
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  {[
                    { key: "all", label: "All" },
                    { key: "ongoing", label: "Ongoing" },
                    { key: "done", label: "Done" },
                    { key: "disputed", label: "Disputed" },
                  ].map((opt) => {
                    const active = freelancerFilter === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setFreelancerFilter(opt.key as "all" | "ongoing" | "done" | "disputed")
                        }
                        className={`rounded-full px-3 py-1 font-medium transition ${
                          active
                            ? isDarkTheme
                              ? "border border-violet-300/60 bg-violet-500/25 text-violet-50"
                              : "border border-violet-400 bg-violet-100 text-violet-800"
                            : isDarkTheme
                            ? "border border-white/12 bg-white/[0.02] text-white/70 hover:border-violet-300/40 hover:bg-violet-500/15"
                            : "border border-[#e1e4f0] bg-white text-[#555a6b] hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className={`hidden grid-cols-[0.9fr_1.2fr_1fr_0.9fr_auto] gap-4 px-4 pb-3 text-[11px] uppercase tracking-[0.16em] lg:grid ${tableBorderClass}`}>
                  <span className={tinyLabelClass}>Job</span>
                  <span className={tinyLabelClass}>Employer</span>
                  <span className={tinyLabelClass}>Escrow amount</span>
                  <span className={tinyLabelClass}>Status</span>
                  <span className={`text-right ${tinyLabelClass}`}>Action</span>
                </div>
                {freelancerJobs.jobs
                  .filter((job) => {
                    if (freelancerFilter === "all") return true;
                    const cat = categorizeStatus(job.status);
                    return cat === freelancerFilter;
                  })
                  .map((job) => (
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
