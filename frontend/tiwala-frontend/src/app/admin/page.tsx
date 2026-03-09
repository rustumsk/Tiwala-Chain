"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { useReadContract, useReadContracts } from "wagmi";
import { Scale, ShieldCheck, Users } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  tiwalaEscrowAbi,
  TIWALA_ESCROW_ADDRESS,
  JOB_STATUS_LABEL,
  type EscrowJobStatus,
} from "@/lib/contract";
import { getStoredProfile } from "@/lib/profile";
import type { Address, Hex } from "viem";

type ParsedJob = {
  id: bigint;
  employer: Address;
  freelancer: Address;
  amount: bigint;
  status: EscrowJobStatus;
  contractHash: Hex;
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUsdt(amount: bigint) {
  const v = Number(amount) / 1_000_000;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminDashboardPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { isDarkTheme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const isAdmin = profile?.role === "admin";

  const counterQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "jobCounter",
    query: { enabled: isAdmin },
  });

  const jobCount = typeof counterQuery.data === "bigint" ? Number(counterQuery.data) : 0;

  const jobContracts = useMemo(
    () =>
      Array.from({ length: jobCount }, (_, i) => ({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "getJob" as const,
        args: [BigInt(i + 1)] as const,
      })),
    [jobCount]
  );

  const jobsQuery = useReadContracts({
    contracts: jobContracts,
    query: { enabled: jobCount > 0 },
    allowFailure: true,
  });

  const allJobs: ParsedJob[] = useMemo(() => {
    if (!jobsQuery.data) return [];
    return jobsQuery.data
      .map((entry, index) => {
        if (entry.status !== "success" || !entry.result) return null;
        const r = entry.result as Record<string, unknown>;
        const status = typeof r.status === "number" ? r.status : typeof r.status === "bigint" ? Number(r.status) : -1;
        if (status < 0 || status > 6) return null;
        return {
          id: BigInt(index + 1),
          employer: r.employer as Address,
          freelancer: r.freelancer as Address,
          amount: r.amount as bigint,
          status: status as EscrowJobStatus,
          contractHash: r.contractHash as Hex,
        };
      })
      .filter((j): j is ParsedJob => j !== null);
  }, [jobsQuery.data]);

  const disputedJobs = allJobs.filter((j) => j.status === 4);
  const activeJobs = allJobs.filter((j) => j.status !== 5 && j.status !== 6);
  const totalEscrow = allJobs.reduce((s, j) => s + Number(j.amount) / 1_000_000, 0);

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

  if (!isAdmin) {
    return (
      <div className={pageClass}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8`}>
          <h1 className={`text-2xl font-semibold ${titleClass}`}>Access denied</h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            This page is restricted to admin accounts.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Moderator
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Admin dashboard
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Overview of all escrow jobs, disputes, and platform activity.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`${chipClass} rounded-full px-3 py-1`}>
              Wallet: {address ? shortAddr(address) : "N/A"}
            </span>
            <span className={`${chipClass} rounded-full px-3 py-1`}>
              Network: {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
            </span>
            <span className={`${actionChipClass} rounded-full px-3 py-1`}>
              Admin
            </span>
          </div>
        </article>

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { label: "Total jobs", value: allJobs.length, icon: ShieldCheck },
            { label: "Active disputes", value: disputedJobs.length, icon: Scale },
            { label: "Total escrow", value: `${formatUsdt(BigInt(Math.round(totalEscrow * 1_000_000)))} USDT`, icon: Users },
          ].map((stat) => (
            <article key={stat.label} className={`${panelClass} rounded-xl p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>{stat.label}</p>
                <span className={`${subtlePanelClass} inline-flex size-9 items-center justify-center rounded-lg`}>
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
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Quick actions</p>
                <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>Manage platform</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href="/admin/disputes"
                className={`${subtlePanelClass} flex items-center gap-3 rounded-xl p-4 transition hover:border-violet-300/40`}
              >
                <span className={`${actionChipClass} inline-flex size-10 shrink-0 items-center justify-center rounded-lg`}>
                  <Scale size={17} />
                </span>
                <div>
                  <p className={`text-sm font-semibold ${titleClass}`}>Resolve disputes</p>
                  <p className={`mt-0.5 text-xs ${mutedTextClass}`}>{disputedJobs.length} pending</p>
                </div>
              </Link>
              <Link
                href="/admin/users"
                className={`${subtlePanelClass} flex items-center gap-3 rounded-xl p-4 transition hover:border-violet-300/40`}
              >
                <span className={`${actionChipClass} inline-flex size-10 shrink-0 items-center justify-center rounded-lg`}>
                  <Users size={17} />
                </span>
                <div>
                  <p className={`text-sm font-semibold ${titleClass}`}>Manage users</p>
                  <p className={`mt-0.5 text-xs ${mutedTextClass}`}>View and manage accounts</p>
                </div>
              </Link>
            </div>
          </article>

          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Status breakdown</p>
                <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>Jobs by status</h2>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([0, 1, 2, 3, 4, 5, 6] as EscrowJobStatus[]).map((s) => {
                const count = allJobs.filter((j) => j.status === s).length;
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

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>All jobs</p>
          <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>Job registry</h2>
          {counterQuery.isLoading || jobsQuery.isLoading ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>Loading jobs from contract...</p>
          ) : allJobs.length === 0 ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>No jobs found on-chain.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className={`hidden grid-cols-[60px_1fr_1fr_100px_100px_80px] gap-3 px-4 pb-2 text-[11px] uppercase tracking-[0.14em] lg:grid ${isDarkTheme ? "border-b border-white/10" : "border-b border-[#eceef5]"}`}>
                <span className={tinyLabelClass}>ID</span>
                <span className={tinyLabelClass}>Employer</span>
                <span className={tinyLabelClass}>Freelancer</span>
                <span className={tinyLabelClass}>Amount</span>
                <span className={tinyLabelClass}>Status</span>
                <span className={`text-right ${tinyLabelClass}`}>View</span>
              </div>
              {allJobs.map((job) => (
                <div
                  key={job.id.toString()}
                  className={`${subtlePanelClass} grid items-center gap-3 rounded-xl px-4 py-3 text-sm lg:grid-cols-[60px_1fr_1fr_100px_100px_80px]`}
                >
                  <span className={`font-semibold tabular-nums ${titleClass}`}>#{job.id.toString()}</span>
                  <span className={`truncate ${mutedTextClass}`}>{shortAddr(job.employer)}</span>
                  <span className={`truncate ${mutedTextClass}`}>{shortAddr(job.freelancer)}</span>
                  <span className={`tabular-nums ${titleClass}`}>{formatUsdt(job.amount)}</span>
                  <span className={`text-xs font-medium ${job.status === 4 ? "text-red-400" : mutedTextClass}`}>
                    {JOB_STATUS_LABEL[job.status]}
                  </span>
                  <div className="text-right">
                    <Link
                      href={`/jobs/${job.id.toString()}`}
                      className={`text-xs font-medium text-violet-400 hover:text-violet-300`}
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
