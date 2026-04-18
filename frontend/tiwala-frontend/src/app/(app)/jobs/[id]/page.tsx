"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useChainId, useReadContract } from "wagmi";
import {
  AlertTriangle,
  CircleDollarSign,
  FileText,
  Hash,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { useThemeStyles } from "@/hooks/use-theme-styles";
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
import {
  downloadJobContractByHashBlob,
  fetchJobDisputeByHash,
  syncJobFromChain,
  type JobDisputeResponse,
} from "@/lib/jobs";
import { API_POLL_INTERVAL_MS, escrowLiveQueryOptions } from "@/lib/realtime";
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
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;
  if (!Number.isInteger(asNumber) || asNumber < 0 || asNumber > 6) return null;
  return asNumber as EscrowJobStatus;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
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

  const [contractError, setContractError] = useState("");
  const [isOpeningContract, setIsOpeningContract] = useState(false);
  const [isSyncingDeliverablesJob, setIsSyncingDeliverablesJob] =
    useState(false);
  const [deliverablesSyncError, setDeliverablesSyncError] = useState("");
  const [isDeliverablesJobReady, setIsDeliverablesJobReady] = useState(false);
  const [deliverablesMeta, setDeliverablesMeta] = useState<{
    hasAny: boolean;
    allApproved: boolean;
  } | null>(null);
  const [deliverablesRefreshKey, setDeliverablesRefreshKey] = useState(0);

  const jobId = useMemo(() => {
    if (!params?.id) return null;
    try {
      return BigInt(params.id);
    } catch {
      return null;
    }
  }, [params?.id]);

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase()
      ? stored
      : null;
  }, [address, isConnected]);

  const jobQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "getJob",
    args: jobId !== null ? [jobId] : undefined,
    query: {
      enabled: jobId !== null && Boolean(isConnected),
      ...escrowLiveQueryOptions,
    },
  });
  const { refetch: refetchOnChainJob } = jobQuery;

  const [disputeInfo, setDisputeInfo] = useState<
    JobDisputeResponse | null | undefined
  >(undefined);
  const [disputeReloadKey, setDisputeReloadKey] = useState(0);

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
    )
      return null;

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
      if (!parsed) {
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
        return;
      }
      setIsSyncingDeliverablesJob(true);
      setDeliverablesSyncError("");
      try {
        await syncJobFromChain(session, {
          onChainJobId: parsed.id.toString(),
          employerWallet: parsed.employer,
          freelancerWallet: parsed.freelancer,
          amountUsdt: Number(parsed.amount) / 1_000_000,
          contractHash: parsed.contractHash,
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
      if (!parsed || !isDeliverablesJobReady) {
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
          parsed.contractHash
        );
        const hasAny = data.length > 0;
        const allApproved =
          hasAny && data.every((d) => d.status === "Approved");
        setDeliverablesMeta({ hasAny, allApproved });
      } catch {
        setDeliverablesMeta(null);
      }
    }
    void loadDeliverables();
  }, [address, deliverablesRefreshKey, isDeliverablesJobReady, parsed]);

  useEffect(() => {
    if (!parsed || parsed.status !== 4) {
      setDisputeInfo(undefined);
      return;
    }
    const session = getStoredAuthSession();
    if (
      !session ||
      !address ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      setDisputeInfo(undefined);
      return;
    }
    let cancelled = false;
    fetchJobDisputeByHash(session, parsed.contractHash)
      .then((d) => {
        if (!cancelled) setDisputeInfo(d);
      })
      .catch(() => {
        if (!cancelled) setDisputeInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, parsed, disputeReloadKey]);

  useVisibleInterval(
    () => setDisputeReloadKey((k) => k + 1),
    API_POLL_INTERVAL_MS,
    Boolean(
      parsed?.status === 4 &&
        address &&
        getStoredAuthSession()?.walletAddress.toLowerCase() ===
          address.toLowerCase()
    )
  );

  const refreshJobDetailState = useCallback(async () => {
    await refetchOnChainJob();
    setDeliverablesRefreshKey((k) => k + 1);
  }, [refetchOnChainJob]);

  const refreshDeliverablesState = useCallback(() => {
    setDeliverablesRefreshKey((k) => k + 1);
  }, []);

  if (jobId === null) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-6xl ${panelClass} rounded-2xl p-8`}
        >
          <p
            className={`text-sm ${isDarkTheme ? "text-red-300" : "text-red-600"}`}
          >
            Invalid job id.
          </p>
        </section>
      </div>
    );
  }

  const canActAsEmployer =
    Boolean(
      address && parsed?.employer.toLowerCase() === address.toLowerCase()
    ) &&
    (profile?.role === "employer" || profile?.role === "both");

  const canActAsFreelancer =
    Boolean(
      address && parsed?.freelancer.toLowerCase() === address.toLowerCase()
    ) &&
    (profile?.role === "freelancer" || profile?.role === "both");

  const canSubmitDeliverables =
    chainId === 11155111 &&
    canActAsFreelancer &&
    (parsed?.status === 2 || parsed?.status === 3);

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
    Boolean(
      deliverablesMeta &&
        deliverablesMeta.hasAny &&
        deliverablesMeta.allApproved
    );

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header card */}
        <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
                On-chain job
              </p>
              <h1
                className={`mt-2 text-3xl font-bold tracking-tight ${titleClass}`}
              >
                Job #{jobId.toString()}
              </h1>
            </div>
            {parsed ? <JobStatusBadge status={parsed.status} /> : null}
          </div>

          {chainId !== 11155111 ? (
            <div
              className={`mt-5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-amber-400/20 bg-amber-500/[0.06] text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} />
                Switch to Sepolia to interact with this job.
              </div>
            </div>
          ) : null}

          {jobQuery.isLoading ? (
            <p className={`mt-5 text-sm ${mutedTextClass}`}>
              Loading job details...
            </p>
          ) : null}

          {jobQuery.isError ? (
            <div
              className={`mt-5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              Failed to load job from contract.
            </div>
          ) : null}

          {parsed ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <Users
                    size={13}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Employer
                  </p>
                </div>
                <p
                  className={`mt-2 text-sm font-medium tabular-nums ${titleClass}`}
                >
                  {shortAddress(parsed.employer)}
                </p>
              </div>
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <Users
                    size={13}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Freelancer
                  </p>
                </div>
                <p
                  className={`mt-2 text-sm font-medium tabular-nums ${titleClass}`}
                >
                  {shortAddress(parsed.freelancer)}
                </p>
              </div>
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <CircleDollarSign
                    size={13}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Escrow amount
                  </p>
                </div>
                <p
                  className={`mt-2 text-sm font-semibold tabular-nums ${titleClass}`}
                >
                  {formatUsdt(parsed.amount)}{" "}
                  <span className={`text-xs font-normal ${mutedTextClass}`}>
                    USDT
                  </span>
                </p>
              </div>
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <Hash
                    size={13}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Contract hash
                  </p>
                </div>
                <p
                  className={`mt-2 truncate text-xs tabular-nums ${mutedTextClass}`}
                  title={parsed.contractHash}
                >
                  {parsed.contractHash}
                </p>
              </div>
            </div>
          ) : null}

          {/* Contract actions */}
          {parsed ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
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
                      session.walletAddress.toLowerCase() !==
                        address.toLowerCase()
                    )
                      throw new Error(
                        "Please sign in with your wallet first."
                      );

                    const blob = await downloadJobContractByHashBlob(
                      session,
                      parsed.contractHash
                    );
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  } catch (err) {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "Unable to open contract.";
                    setContractError(msg);
                    notifyError(msg);
                  } finally {
                    setIsOpeningContract(false);
                  }
                }}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${isDarkTheme ? "border-white/12 bg-white/[0.03] text-white/90 hover:border-violet-300/30 hover:bg-violet-500/10" : "border-[#d8dced] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50"}`}
              >
                <FileText size={14} />
                {isOpeningContract ? "Opening..." : "View contract"}
              </button>
              <Link
                href={`/contracts/verify?jobId=${parsed.id.toString()}`}
                className={`${actionChipClass} inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition hover:border-violet-300/50 hover:bg-violet-500/20`}
              >
                <ShieldCheck size={14} />
                Verify contract
              </Link>
              {contractError ? (
                <p
                  className={`text-sm ${isDarkTheme ? "text-red-300" : "text-red-600"}`}
                >
                  {contractError}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>

        {/* Dispute banner */}
        {parsed && parsed.status === 4 ? (
          <article
            className={`rounded-2xl border p-6 lg:p-8 ${isDarkTheme ? "border-amber-400/20 bg-amber-500/[0.04]" : "border-amber-200 bg-amber-50/80"}`}
          >
            <h2
              className={`text-lg font-bold ${isDarkTheme ? "text-amber-100" : "text-amber-950"}`}
            >
              Dispute in progress
            </h2>
            <p
              className={`mt-2 text-sm leading-6 ${isDarkTheme ? "text-amber-100/70" : "text-amber-900/80"}`}
            >
              Funds stay in escrow until a moderator resolves this job on-chain.
            </p>

            {disputeInfo === undefined ? (
              <p className={`mt-3 text-sm ${mutedTextClass}`}>
                Loading dispute summary...
              </p>
            ) : disputeInfo === null ? (
              <p className={`mt-3 text-sm ${mutedTextClass}`}>
                No off-chain summary is on file yet.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => {
                    if (!parsed) return;
                    const session = getStoredAuthSession();
                    if (
                      !session ||
                      !address ||
                      session.walletAddress.toLowerCase() !==
                        address.toLowerCase()
                    ) {
                      notifyError(
                        "Please sign in with your wallet first."
                      );
                      return;
                    }
                    setDisputeInfo(undefined);
                    fetchJobDisputeByHash(session, parsed.contractHash)
                      .then((d) => setDisputeInfo(d))
                      .catch(() => setDisputeInfo(null));
                  }}
                >
                  Refresh
                </button>
              </p>
            ) : (
              <dl
                className={`mt-4 space-y-3 rounded-xl border p-4 text-sm ${isDarkTheme ? "border-white/10 bg-black/20" : "border-amber-200/80 bg-white"}`}
              >
                <div>
                  <dt className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    Reported by
                  </dt>
                  <dd
                    className={`mt-1 font-mono text-xs ${titleClass}`}
                  >
                    {shortAddress(disputeInfo.raisedByWallet)}
                  </dd>
                </div>
                <div>
                  <dt className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    Reason
                  </dt>
                  <dd className={`mt-1 ${titleClass}`}>
                    {disputeInfo.reasonLabel}
                  </dd>
                </div>
                {disputeInfo.details ? (
                  <div>
                    <dt className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                      Details
                    </dt>
                    <dd
                      className={`mt-1 whitespace-pre-wrap ${mutedTextClass}`}
                    >
                      {disputeInfo.details}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    Recorded
                  </dt>
                  <dd className={`mt-1 ${mutedTextClass}`}>
                    {new Date(disputeInfo.createdAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}
          </article>
        ) : null}

        {/* Timeline + Actions */}
        {parsed ? (
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <JobTimeline status={parsed.status} mode={theme} />
            <ActionButtons
              canActAsEmployer={canActAsEmployer}
              canActAsFreelancer={canActAsFreelancer}
              chainOk={chainId === 11155111}
              contractHash={parsed.contractHash}
              jobAmount={parsed.amount}
              jobId={parsed.id}
              mode={theme}
              onAfterDisputeRecord={async () => {
                await refetchOnChainJob();
                setDisputeReloadKey((k) => k + 1);
              }}
              onAfterTransaction={refreshJobDetailState}
              status={parsed.status}
              canSubmitWorkOnChain={canSubmitWorkOnChain}
            />
          </div>
        ) : null}

        {/* Deliverables sync error */}
        {deliverablesSyncError ? (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {deliverablesSyncError}
          </div>
        ) : null}

        {/* Deliverables panel */}
        {parsed ? (
          isSyncingDeliverablesJob ? (
            <article
              className={`${panelClass} rounded-2xl p-6 text-sm ${mutedTextClass}`}
            >
              Preparing deliverables...
            </article>
          ) : isDeliverablesJobReady ? (
            <DeliverablesPanel
              contractHash={parsed.contractHash}
              canActAsEmployer={canActAsEmployer}
              canActAsFreelancer={canActAsFreelancer}
              canSubmit={canSubmitDeliverables}
              onAfterChange={refreshDeliverablesState}
              submitLockReason={deliverableSubmitLockReason}
            />
          ) : null
        ) : null}

        {/* Footer nav */}
        <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
          <p
            className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
          >
            Transaction history
          </p>
          <h2
            className={`mt-1.5 text-lg font-bold tracking-tight ${titleClass}`}
          >
            Event log
          </h2>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            Event-level history from contract logs will be wired once the event
            ABI is finalized. Current transaction feedback is shown in the
            action panel above.
          </p>
          <Link
            className={`${actionChipClass} mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium transition hover:border-violet-300/50 hover:bg-violet-500/20`}
            href="/dashboard"
          >
            Back to Dashboard
          </Link>
        </article>
      </section>
    </div>
  );
}
