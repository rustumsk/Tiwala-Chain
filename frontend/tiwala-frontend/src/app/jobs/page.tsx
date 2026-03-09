"use client";

import { useMemo } from "react";
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

  const showEmployerList = profile?.role === "employer" || profile?.role === "both";
  const showFreelancerList = profile?.role === "freelancer" || profile?.role === "both";

  const employerJobs = useEmployerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showEmployerList),
  });

  const freelancerJobs = useFreelancerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showFreelancerList),
  });
  const isDarkTheme = theme === "dark";

  return (
    <div className="themed-app-page text-slate-100">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <article
          className={`p-8 ${
            isDarkTheme
              ? "border border-white/12 bg-black/28"
              : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
          }`}
        >
          <h1 className="text-2xl font-semibold text-slate-100">Job Workspace</h1>
          <p className="mt-2 text-sm text-slate-300">
            Review your escrow jobs by role and open each one for full on-chain details.
          </p>
        </article>

        {showEmployerList ? (
          <article
            className={`p-8 ${
              isDarkTheme
                ? "border border-white/12 bg-black/28"
                : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
            }`}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">Employer Jobs</h2>
              <span className="text-xs text-slate-400">{employerJobs.jobIds.length} total</span>
            </div>

            {employerJobs.isLoading ? (
              <p className="text-sm text-slate-400">Loading employer jobs...</p>
            ) : employerJobs.isError ? (
              <p className="text-sm text-red-300">Could not load employer jobs from contract.</p>
            ) : employerJobs.jobs.length === 0 ? (
              <p className="text-sm text-slate-400">No employer jobs found.</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden grid-cols-[0.9fr_1.2fr_1fr_0.9fr_auto] gap-4 border-b border-white/8 px-4 pb-3 text-[11px] uppercase tracking-[0.16em] text-slate-500 lg:grid">
                  <span>Job</span>
                  <span>Freelancer</span>
                  <span>Escrow Amount</span>
                  <span>Status</span>
                  <span className="text-right">Action</span>
                </div>
                {employerJobs.jobs.map((job) => (
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
          <article
            className={`p-8 ${
              isDarkTheme
                ? "border border-white/12 bg-black/28"
                : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
            }`}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">Freelancer Jobs</h2>
              <span className="text-xs text-slate-400">{freelancerJobs.jobIds.length} total</span>
            </div>

            {freelancerJobs.isLoading ? (
              <p className="text-sm text-slate-400">Loading freelancer jobs...</p>
            ) : freelancerJobs.isError ? (
              <p className="text-sm text-red-300">Could not load freelancer jobs from contract.</p>
            ) : freelancerJobs.jobs.length === 0 ? (
              <p className="text-sm text-slate-400">No freelancer jobs found.</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden grid-cols-[0.9fr_1.2fr_1fr_0.9fr_auto] gap-4 border-b border-white/8 px-4 pb-3 text-[11px] uppercase tracking-[0.16em] text-slate-500 lg:grid">
                  <span>Job</span>
                  <span>Employer</span>
                  <span>Escrow Amount</span>
                  <span>Status</span>
                  <span className="text-right">Action</span>
                </div>
                {freelancerJobs.jobs.map((job) => (
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
