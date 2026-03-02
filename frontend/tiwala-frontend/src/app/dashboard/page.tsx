"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import JobCard from "@/components/jobs/job-card";
import {
  useEmployerJobs,
  useFreelancerJobs,
} from "@/hooks/use-escrow-jobs";
import { getStoredProfile, type LocalUserProfile } from "@/lib/profile";

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
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

  const shortWallet = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "Not connected";

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/80">
            Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-100">
            Welcome{profile ? `, ${profile.displayName}` : ""}.
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1">
              Wallet: {shortWallet}
            </span>
            <span className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1 capitalize">
              Role: {profile?.role ?? "unknown"}
            </span>
            <span className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1">
              Network: {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
            </span>
          </div>
          {chainId !== 11155111 ? (
            <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Switch to Sepolia to read your on-chain jobs.
            </p>
          ) : null}
        </article>

        {showEmployerList ? (
          <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">Employer Jobs</h2>
              <span className="text-xs text-slate-400">
                {employerJobs.jobIds.length} total
              </span>
            </div>

            {employerJobs.isLoading ? (
              <p className="text-sm text-slate-400">Loading employer jobs...</p>
            ) : employerJobs.isError ? (
              <p className="text-sm text-red-300">
                Could not load employer jobs from contract.
              </p>
            ) : employerJobs.jobs.length === 0 ? (
              <p className="text-sm text-slate-400">No employer jobs found.</p>
            ) : (
              <div className="space-y-3">
                {employerJobs.jobs.map((job) => (
                  <JobCard
                    counterpartyAddress={job.freelancer}
                    counterpartyLabel="Freelancer"
                    job={job}
                    key={`employer-${job.id.toString()}`}
                  />
                ))}
              </div>
            )}
          </article>
        ) : null}

        {showFreelancerList ? (
          <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">
                Freelancer Jobs
              </h2>
              <span className="text-xs text-slate-400">
                {freelancerJobs.jobIds.length} total
              </span>
            </div>

            {freelancerJobs.isLoading ? (
              <p className="text-sm text-slate-400">Loading freelancer jobs...</p>
            ) : freelancerJobs.isError ? (
              <p className="text-sm text-red-300">
                Could not load freelancer jobs from contract.
              </p>
            ) : freelancerJobs.jobs.length === 0 ? (
              <p className="text-sm text-slate-400">No freelancer jobs found.</p>
            ) : (
              <div className="space-y-3">
                {freelancerJobs.jobs.map((job) => (
                  <JobCard
                    counterpartyAddress={job.employer}
                    counterpartyLabel="Employer"
                    job={job}
                    key={`freelancer-${job.id.toString()}`}
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
