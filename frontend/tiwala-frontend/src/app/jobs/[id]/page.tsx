"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useAppTheme } from "@/components/layout/theme-context";
import JobStatusBadge from "@/components/jobs/job-status-badge";
import JobTimeline from "@/components/jobs/job-timeline";
import ActionButtons from "@/components/jobs/action-buttons";
import DeliverablesPanel from "@/components/jobs/deliverables-panel";
import { getStoredAuthSession } from "@/lib/auth";
import {
  tiwalaEscrowAbi,
  TIWALA_ESCROW_ADDRESS,
  type EscrowJobStatus,
} from "@/lib/contract";
import { downloadJobContractByHashBlob, syncJobFromChain } from "@/lib/jobs";
import { notifyError } from "@/lib/notify";
import { listDeliverablesByHash, type Deliverable } from "@/lib/deliverables";
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
  const { theme, isDarkTheme } = useAppTheme();
  const [contractError, setContractError] = useState("");
  const [isOpeningContract, setIsOpeningContract] = useState(false);
  const [isSyncingDeliverablesJob, setIsSyncingDeliverablesJob] = useState(false);
  const [deliverablesSyncError, setDeliverablesSyncError] = useState("");
  const [isDeliverablesJobReady, setIsDeliverablesJobReady] = useState(false);
  const [deliverablesMeta, setDeliverablesMeta] = useState<{
    hasAny: boolean;
    allApproved: boolean;
  } | null>(null);

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

  useEffect(() => {
    async function syncDeliverablesJob() {
      const parsedJob = parsed;
      if (!parsedJob) {
        setIsDeliverablesJobReady(false);
        setDeliverablesSyncError("");
        return;
      }

      const session = getStoredAuthSession();
      if (
        !session ||
        !address ||
        session.walletAddress.toLowerCase() !== address.toLowerCase()
      ) {
        setIsDeliverablesJobReady(false);
        setDeliverablesSyncError("");
        return;
      }

      setIsSyncingDeliverablesJob(true);
      setDeliverablesSyncError("");

      try {
        await syncJobFromChain(session, {
          onChainJobId: parsedJob.id.toString(),
          employerWallet: parsedJob.employer,
          freelancerWallet: parsedJob.freelancer,
          amountUsdt: Number(parsedJob.amount) / 1_000_000,
          contractHash: parsedJob.contractHash,
        });
        setIsDeliverablesJobReady(true);
      } catch (error) {
        setIsDeliverablesJobReady(false);
        setDeliverablesMeta(null);
        setDeliverablesSyncError(
          error instanceof Error
            ? error.message
            : "Unable to prepare deliverables for this job."
        );
      } finally {
        setIsSyncingDeliverablesJob(false);
      }
    }

    void syncDeliverablesJob();
  }, [address, parsed]);

  useEffect(() => {
    async function loadDeliverables() {
      const parsedJob = parsed;
      if (!parsedJob || !isDeliverablesJobReady) {
        setDeliverablesMeta(null);
        return;
      }
      try {
        const session = getStoredAuthSession();
        if (
          !session ||
          !address ||
          session.walletAddress.toLowerCase() !== address.toLowerCase()
        ) {
          setDeliverablesMeta(null);
          return;
        }
        const data: Deliverable[] = await listDeliverablesByHash(
          session,
          parsedJob.contractHash
        );
        const hasAny = data.length > 0;
        const allApproved = hasAny && data.every((d) => d.status === "Approved");
        setDeliverablesMeta({ hasAny, allApproved });
      } catch {
        setDeliverablesMeta(null);
      }
    }
    void loadDeliverables();
  }, [address, isDeliverablesJobReady, parsed]);

  if (jobId === null) {
    return (
      <div className="themed-app-page text-slate-100">
        <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(120,70,220,0.14)] backdrop-blur-md">
          <p className="text-sm text-red-300">Invalid job id.</p>
        </section>
      </div>
    );
  }

  const canActAsEmployer =
    Boolean(address && parsed?.employer.toLowerCase() === address.toLowerCase()) &&
    profile?.role === "employer";

  const canActAsFreelancer =
    Boolean(address && parsed?.freelancer.toLowerCase() === address.toLowerCase()) &&
    profile?.role === "freelancer";

  const canSubmitDeliverables =
    chainId === 11155111 &&
    canActAsFreelancer &&
    (parsed?.status === 2 || parsed?.status === 3); // Work or Review

  const deliverableSubmitLockReason = !canActAsFreelancer
    ? null
    : chainId !== 11155111
      ? "Switch to Sepolia to manage deliverables for this job."
      : parsed?.status !== 2 && parsed?.status !== 3
        ? "Deliverables unlock after the employer starts work."
        : null;

  const canSubmitWorkOnChain =
    canActAsFreelancer &&
    parsed?.status === 2 &&
    Boolean(deliverablesMeta && deliverablesMeta.hasAny && deliverablesMeta.allApproved);

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
              <div className={`p-4 ${isDarkTheme ? "border border-white/12 bg-white/[0.03]" : "border border-[#e8ebf5] bg-[#f9faff]"}`}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Employer</p>
                <p className="mt-1 text-sm text-slate-100">{shortAddress(parsed.employer)}</p>
              </div>
              <div className={`p-4 ${isDarkTheme ? "border border-white/12 bg-white/[0.03]" : "border border-[#e8ebf5] bg-[#f9faff]"}`}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Freelancer</p>
                <p className="mt-1 text-sm text-slate-100">{shortAddress(parsed.freelancer)}</p>
              </div>
              <div className={`p-4 ${isDarkTheme ? "border border-white/12 bg-white/[0.03]" : "border border-[#e8ebf5] bg-[#f9faff]"}`}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Escrow Amount</p>
                <p className="mt-1 text-sm text-slate-100">{formatUsdt(parsed.amount)} USDT</p>
              </div>
              <div className={`p-4 ${isDarkTheme ? "border border-white/12 bg-white/[0.03]" : "border border-[#e8ebf5] bg-[#f9faff]"}`}>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Contract Hash</p>
                <p className="mt-1 break-all text-xs text-slate-200">{parsed.contractHash}</p>
              </div>
            </div>
          ) : null}

          {parsed ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isOpeningContract}
                onClick={async () => {
                  if (!address) return;
                  setContractError("");
                  setIsOpeningContract(true);
                  try {
                    const session = getStoredAuthSession();
                    if (
                      !session ||
                      session.walletAddress.toLowerCase() !== address.toLowerCase()
                    ) {
                      throw new Error("Please sign in with your wallet first.");
                    }

                    const blob = await downloadJobContractByHashBlob(
                      session,
                      parsed.contractHash
                    );
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  } catch (err) {
                    const msg =
                      err instanceof Error ? err.message : "Unable to open contract.";
                    setContractError(msg);
                    notifyError(msg);
                  } finally {
                    setIsOpeningContract(false);
                  }
                }}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition ${
                  isDarkTheme
                    ? "border-white/14 bg-white/[0.04] text-white/90 hover:border-violet-300/35 hover:bg-violet-500/15"
                    : "border-[#d8dced] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50"
                }`}
              >
                {isOpeningContract ? "Opening contract..." : "View contract"}
              </button>
              {contractError ? (
                <p className={`text-sm ${isDarkTheme ? "text-red-200" : "text-red-700"}`}>
                  {contractError}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>

        {parsed ? (
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <JobTimeline status={parsed.status} mode={theme} />
            <ActionButtons
              canActAsEmployer={canActAsEmployer}
              canActAsFreelancer={canActAsFreelancer}
              chainOk={chainId === 11155111}
              jobAmount={parsed.amount}
              jobId={parsed.id}
              mode={theme}
              status={parsed.status}
              canSubmitWorkOnChain={canSubmitWorkOnChain}
            />
          </div>
        ) : null}

        {deliverablesSyncError ? (
          <article
            className={`rounded-3xl border p-4 text-sm ${
              isDarkTheme
                ? "border-red-400/30 bg-red-500/10 text-red-200"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {deliverablesSyncError}
          </article>
        ) : null}

        {parsed ? (
          isSyncingDeliverablesJob ? (
            <article
              className={`rounded-3xl border p-6 text-sm ${
                isDarkTheme
                  ? "border-white/12 bg-black/28 text-white/70"
                  : "border-[#e4e8f2] bg-white text-[#5c6172]"
              }`}
            >
              Preparing deliverables...
            </article>
          ) : isDeliverablesJobReady ? (
            <DeliverablesPanel
              contractHash={parsed.contractHash}
              canActAsEmployer={canActAsEmployer}
              canActAsFreelancer={canActAsFreelancer}
              canSubmit={canSubmitDeliverables}
              submitLockReason={deliverableSubmitLockReason}
            />
          ) : null
        ) : null}

        <article
          className={`p-8 ${
            isDarkTheme
              ? "border border-white/12 bg-black/28"
              : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]"
          }`}
        >
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
