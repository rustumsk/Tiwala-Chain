"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useChainId, useReadContract } from "wagmi";
import JobStatusBadge from "@/components/jobs/job-status-badge";
import JobTimeline from "@/components/jobs/job-timeline";
import ActionButtons from "@/components/jobs/action-buttons";
import {
  tiwalaEscrowAbi,
  TIWALA_ESCROW_ADDRESS,
  type EscrowJobStatus,
} from "@/lib/contract";
import { getStoredProfile } from "@/lib/profile";

function formatUsdt(amount: bigint) {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeStatus(value: unknown): EscrowJobStatus | null {
  const asNumber =
    typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(asNumber) || asNumber < 0 || asNumber > 6) return null;
  return asNumber as EscrowJobStatus;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const jobId = useMemo(() => {
    if (!params?.id) return null;
    try {
      return BigInt(params.id);
    } catch {
      return null;
    }
  }, [params?.id]);

  const profile = useMemo(() => {
    if (!address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      router.replace("/");
      return;
    }
    if (!profile) {
      router.replace("/onboarding");
    }
  }, [address, isConnected, profile, router]);

  const jobQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "getJob",
    args: jobId !== null ? [jobId] : undefined,
    query: { enabled: jobId !== null && Boolean(isConnected) },
  });

  const parsed = useMemo(() => {
    const raw = jobQuery.data;
    if (!raw || jobId === null) return null;

    let employer: unknown;
    let freelancer: unknown;
    let amount: unknown;
    let status: unknown;
    let contractHash: unknown;

    if (Array.isArray(raw)) {
      if (raw.length < 6) return null;
      [employer, freelancer, amount, status, contractHash] = raw;
    } else {
      const record = asRecord(raw);
      if (!record) return null;
      employer = record.employer;
      freelancer = record.freelancer;
      amount = record.amount;
      status = record.status;
      contractHash = record.contractHash;
    }

    const normalizedAmount =
      typeof amount === "bigint"
        ? amount
        : typeof amount === "number" && Number.isFinite(amount)
          ? BigInt(amount)
          : null;
    const normalizedStatus = normalizeStatus(status);
    if (
      typeof employer !== "string" ||
      typeof freelancer !== "string" ||
      typeof contractHash !== "string" ||
      normalizedAmount === null ||
      normalizedStatus === null
    ) {
      return null;
    }
    return {
      id: jobId,
      employer,
      freelancer,
      amount: normalizedAmount,
      contractHash,
      status: normalizedStatus,
    };
  }, [jobId, jobQuery.data]);

  if (jobId === null) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
        <section className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <p className="text-sm text-red-300">Invalid job id.</p>
        </section>
      </div>
    );
  }

  const canActAsEmployer =
    Boolean(address && parsed?.employer.toLowerCase() === address.toLowerCase()) &&
    (profile?.role === "employer" || profile?.role === "both");

  const canActAsFreelancer =
    Boolean(address && parsed?.freelancer.toLowerCase() === address.toLowerCase()) &&
    (profile?.role === "freelancer" || profile?.role === "both");

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">Job #{jobId.toString()}</h1>
            {parsed ? <JobStatusBadge status={parsed.status} /> : null}
          </div>

          {chainId !== 11155111 ? (
            <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Switch to Sepolia to interact with this job.
            </p>
          ) : null}

          {jobQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-400">Loading job details...</p>
          ) : null}

          {jobQuery.isError ? (
            <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              Failed to load job from contract.
            </p>
          ) : null}

          {parsed ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Employer</p>
                <p className="mt-1 text-sm text-slate-100">{shortAddress(parsed.employer)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Freelancer</p>
                <p className="mt-1 text-sm text-slate-100">{shortAddress(parsed.freelancer)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Escrow Amount</p>
                <p className="mt-1 text-sm text-slate-100">{formatUsdt(parsed.amount)} USDT</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Contract Hash</p>
                <p className="mt-1 break-all text-xs text-slate-200">{parsed.contractHash}</p>
              </div>
            </div>
          ) : null}
        </article>

        {parsed ? (
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <JobTimeline status={parsed.status} />
            <ActionButtons
              canActAsEmployer={canActAsEmployer}
              canActAsFreelancer={canActAsFreelancer}
              chainOk={chainId === 11155111}
              jobAmount={parsed.amount}
              jobId={parsed.id}
              status={parsed.status}
            />
          </div>
        ) : null}

        <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <h2 className="text-lg font-semibold text-slate-100">Transaction History</h2>
          <p className="mt-3 text-sm text-slate-300">
            Event-level history from contract logs will be wired once event ABI is finalized.
            Current transaction feedback is shown in the action panel above.
          </p>
          <Link
            className="mt-4 inline-flex h-10 items-center rounded-xl border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
            href="/dashboard"
          >
            Back to Dashboard
          </Link>
        </article>
      </section>
    </div>
  );
}
