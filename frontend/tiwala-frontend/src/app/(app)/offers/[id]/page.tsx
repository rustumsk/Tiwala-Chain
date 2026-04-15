"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { useEmployerJobs } from "@/hooks/use-escrow-jobs";
import { useParams, useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits, type Address } from "viem";
import {
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import {
  acceptJobOffer,
  declineJobOffer,
  downloadJobContractBlob,
  fetchJobById,
  syncJobFromChain,
  type JobResponse,
} from "@/lib/jobs";
import { getStoredAuthSession } from "@/lib/auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";
import ClauseAnalysis from "@/components/ai/clause-analysis";
import FairnessScore from "@/components/ai/fairness-score";
import {
  type AIResponse,
  extractScore,
  extractClauses,
} from "@/lib/ai-parsing";
import { tiwalaEscrowAbi, TIWALA_ESCROW_ADDRESS } from "@/lib/contract";

export default function OfferDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    data: txHash,
    error: txError,
    isPending: isTxPending,
    writeContract,
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });
  const {
    isDarkTheme,
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    pageClass,
    actionChipClass,
  } = useThemeStyles();

  const [job, setJob] = useState<JobResponse | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobError, setJobError] = useState("");

  const [analysisRaw, setAnalysisRaw] = useState<AIResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [actionError, setActionError] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [onchainError, setOnchainError] = useState("");
  const [isSyncingOnChainJob, setIsSyncingOnChainJob] = useState(false);
  const [syncedOnChainJobId, setSyncedOnChainJobId] = useState<string | null>(
    null
  );

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase()
      ? stored
      : null;
  }, [address, isConnected]);

  const loadJob = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isConnected || !address) return;
      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== address.toLowerCase()
      )
        return;

      const idNumber = Number(params?.id);
      if (!Number.isFinite(idNumber) || idNumber <= 0) {
        setJobError("Invalid offer id.");
        setLoadingJob(false);
        return;
      }

      if (!opts?.silent) {
        setLoadingJob(true);
        setJobError("");
      }

      try {
        const data = await fetchJobById(session, idNumber);
        setJob(data);
      } catch (err) {
        if (!opts?.silent) {
          setJobError(
            err instanceof Error ? err.message : "Failed to load offer."
          );
        }
      } finally {
        if (!opts?.silent) setLoadingJob(false);
      }
    },
    [address, isConnected, params?.id]
  );

  useEffect(() => {
    void loadJob({ silent: false });
  }, [loadJob]);

  useVisibleInterval(
    () => void loadJob({ silent: true }),
    API_POLL_INTERVAL_MS,
    Boolean(
      isConnected &&
        address &&
        getStoredAuthSession()?.walletAddress.toLowerCase() ===
          address.toLowerCase() &&
        params?.id &&
        Number.isFinite(Number(params.id)) &&
        Number(params.id) > 0
    )
  );

  const fairnessScore = analysisRaw ? extractScore(analysisRaw) : null;
  const clauseItems = analysisRaw ? extractClauses(analysisRaw) : [];
  const hasUnfairClause = clauseItems.some((item) => !item.isFair);

  const isEmployerView =
    !!job &&
    !!profile &&
    profile.role === "employer" &&
    job.employerWallet.toLowerCase() === profile.wallet.toLowerCase();

  const { jobs: employerOnChainJobs } = useEmployerJobs({
    walletAddress:
      isEmployerView && address ? (address as Address) : undefined,
    enabled: Boolean(isEmployerView && address && chainId === 11155111),
  });

  const matchingOnChainJob = useMemo(() => {
    if (!job) return null;
    const normalizedHash = `0x${job.contractHash.replace(/^0x/i, "").toLowerCase()}`;
    return (
      employerOnChainJobs.find(
        (item) => item.contractHash.toLowerCase() === normalizedHash
      ) ?? null
    );
  }, [employerOnChainJobs, job]);

  useEffect(() => {
    async function syncExistingOnChainJob() {
      if (!job || !matchingOnChainJob || !address) return;
      if (syncedOnChainJobId === matchingOnChainJob.id.toString()) return;

      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== address.toLowerCase()
      )
        return;

      setIsSyncingOnChainJob(true);
      try {
        await syncJobFromChain(session, {
          onChainJobId: matchingOnChainJob.id.toString(),
          employerWallet: job.employerWallet,
          freelancerWallet: job.freelancerWallet,
          amountUsdt: Number(job.amountUsdt),
          contractHash: job.contractHash,
          title: job.title,
          description: job.description,
        });
        setSyncedOnChainJobId(matchingOnChainJob.id.toString());
      } catch (err) {
        setOnchainError(
          err instanceof Error
            ? err.message
            : "Unable to sync the created on-chain job back into the app."
        );
      } finally {
        setIsSyncingOnChainJob(false);
      }
    }

    void syncExistingOnChainJob();
  }, [address, job, matchingOnChainJob, syncedOnChainJobId]);

  const handleViewContract = async () => {
    if (!job || !address) return;
    const session = getStoredAuthSession();
    if (
      !session ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      setAnalysisError("Please sign in with your wallet first.");
      return;
    }
    try {
      const blob = await downloadJobContractBlob(session, job.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Unable to fetch contract."
      );
    }
  };

  const handleAnalyze = async () => {
    if (!job || !address) return;
    const session = getStoredAuthSession();
    if (
      !session ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      const msg = "Please sign in with your wallet first.";
      setAnalysisError(msg);
      notifyError(msg);
      return;
    }

    setAnalysisError("");
    setIsAnalyzing(true);

    try {
      const blob = await downloadJobContractBlob(session, job.id);
      const file = new File([blob], "contract.pdf", { type: blob.type });

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ai/evaluate-file", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const message = details?.error
          ? `${details.error} (${response.status})`
          : `AI service error (${response.status})`;
        throw new Error(message);
      }

      const payload = (await response.json()) as AIResponse;
      setAnalysisRaw(payload);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unable to analyze contract.";
      setAnalysisError(msg);
      notifyError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAccept = async () => {
    if (!job || !address) return;
    const session = getStoredAuthSession();
    if (
      !session ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      const msg = "Please sign in with your wallet first.";
      setActionError(msg);
      notifyError(msg);
      return;
    }

    setActionError("");
    setIsAccepting(true);
    try {
      const updated = await acceptJobOffer(session, job.id);
      setJob(updated);
      notifySuccess("Offer accepted.");
      router.replace("/jobs");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to accept offer.";
      setActionError(msg);
      notifyError(msg);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!job || !address) return;
    const session = getStoredAuthSession();
    if (
      !session ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      const msg = "Please sign in with your wallet first.";
      setActionError(msg);
      notifyError(msg);
      return;
    }

    setActionError("");
    setIsDeclining(true);
    try {
      const updated = await declineJobOffer(session, job.id);
      setJob(updated);
      notifySuccess("Offer declined.");
      router.replace("/offers");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to decline offer.";
      setActionError(msg);
      notifyError(msg);
    } finally {
      setIsDeclining(false);
    }
  };

  const btnPrimary = isDarkTheme
    ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-500/20 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/60 hover:bg-emerald-500/30 disabled:opacity-50"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 px-5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50";
  const btnDanger = isDarkTheme
    ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-300/40 bg-red-500/15 px-5 text-sm font-semibold text-red-100 transition hover:border-red-200/60 hover:bg-red-500/25 disabled:opacity-50"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-5 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-50";

  if (!isConnected) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-2xl px-6 py-10 text-center lg:px-8`}
        >
          <h1
            className={`text-2xl font-bold tracking-tight ${titleClass}`}
          >
            Connect wallet to continue
          </h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            Connect your wallet from the navbar to review job offers sent to
            you.
          </p>
        </section>
      </div>
    );
  }

  if (loadingJob) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto flex w-full max-w-[1580px] items-center justify-center ${panelClass} rounded-2xl px-6 py-16`}
        >
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className={mutedTextClass}>Loading offer details...</span>
          </div>
        </section>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-2xl px-6 py-10 text-center lg:px-8`}
        >
          <h1
            className={`text-2xl font-bold tracking-tight ${titleClass}`}
          >
            Unable to load offer
          </h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            {jobError || "Offer not found or you are not allowed to view it."}
          </p>
        </section>
      </div>
    );
  }

  const isPending =
    job.status === "PendingOffer" || job.status === "pendingoffer";
  const isAccepted =
    job.status === "Accepted" || job.status === "accepted";
  const createOnChainDisabled =
    !isAccepted ||
    isTxPending ||
    receipt.isLoading ||
    Boolean(matchingOnChainJob) ||
    isSyncingOnChainJob;

  const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div className={pageClass}>
      <section className="mx-auto grid w-full max-w-[1580px] gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left — Offer details */}
        <div className="space-y-6">
          <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
              Job offer
            </p>
            <h1
              className={`mt-2 text-3xl font-bold tracking-tight ${titleClass}`}
            >
              {job.title || `Offer #${job.id}`}
            </h1>
            <p className={`mt-1.5 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
              Review this contract and decide whether to accept or decline the
              work.
            </p>

            {/* Info grid */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <CircleDollarSign
                    size={14}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Offered amount
                  </p>
                </div>
                <p
                  className={`mt-2 text-lg font-bold tabular-nums ${titleClass}`}
                >
                  {job.amountUsdt.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  <span className={`text-sm font-medium ${mutedTextClass}`}>
                    USDT
                  </span>
                </p>
              </div>
              <div className={`${subtlePanelClass} rounded-xl p-4`}>
                <div className="flex items-center gap-2">
                  <Users
                    size={14}
                    className={isDarkTheme ? "text-violet-400" : "text-violet-500"}
                  />
                  <p
                    className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                  >
                    Parties
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  <p className={`text-xs ${mutedTextClass}`}>
                    <span className={`font-medium ${titleClass}`}>
                      Employer
                    </span>{" "}
                    {shortAddr(job.employerWallet)}
                  </p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    <span className={`font-medium ${titleClass}`}>
                      Freelancer
                    </span>{" "}
                    {shortAddr(job.freelancerWallet)}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {job.description ? (
              <div className={`mt-4 ${subtlePanelClass} rounded-xl p-4`}>
                <p
                  className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}
                >
                  Description
                </p>
                <p
                  className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${mutedTextClass}`}
                >
                  {job.description}
                </p>
              </div>
            ) : null}

            {/* Contract PDF row */}
            <div
              className={`mt-4 ${subtlePanelClass} flex items-center justify-between rounded-xl p-4`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex size-9 items-center justify-center rounded-xl ${isDarkTheme ? "bg-violet-500/10" : "bg-violet-50"}`}
                >
                  <FileText
                    className={isDarkTheme ? "text-violet-300" : "text-violet-600"}
                    size={18}
                  />
                </span>
                <div>
                  <p className={`text-sm font-medium ${titleClass}`}>
                    Contract PDF
                  </p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    Stored off-chain with integrity hash on the job record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleViewContract}
                className={`${actionChipClass} inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/20`}
              >
                View
              </button>
            </div>
          </article>

          {/* Actions */}
          <article className={`${panelClass} rounded-2xl p-6 lg:p-8`}>
            {actionError ? (
              <div
                className={`mb-5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
              >
                {actionError}
              </div>
            ) : null}

            {/* Freelancer actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!isPending || isAccepting}
                onClick={handleAccept}
                className={btnPrimary}
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Accept offer
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!isPending || isDeclining}
                onClick={handleDecline}
                className={btnDanger}
              >
                {isDeclining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Declining...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Decline
                  </>
                )}
              </button>
            </div>

            {/* Employer on-chain section */}
            {isEmployerView ? (
              <div className="mt-6 space-y-3">
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
                >
                  Escrow funding
                </p>
                <h3
                  className={`text-lg font-bold tracking-tight ${titleClass}`}
                >
                  Create on-chain job
                </h3>
                <p className={`text-sm ${mutedTextClass}`}>
                  Once the freelancer accepts, create the escrow job on-chain
                  and fund it with USDT.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={createOnChainDisabled}
                    onClick={async () => {
                      if (!job || !address) return;
                      setOnchainError("");

                      if (matchingOnChainJob) {
                        setOnchainError(
                          `This contract already has an on-chain job (#${matchingOnChainJob.id.toString()}).`
                        );
                        return;
                      }

                      if (chainId !== 11155111) {
                        setOnchainError(
                          "Switch your wallet to Sepolia before creating the on-chain job."
                        );
                        return;
                      }

                      try {
                        const amount = parseUnits(
                          String(job.amountUsdt),
                          6
                        );
                        const hash32 =
                          `0x${job.contractHash}` as `0x${string}`;

                        writeContract({
                          address: TIWALA_ESCROW_ADDRESS,
                          abi: tiwalaEscrowAbi,
                          functionName: "createJob",
                          args: [
                            job.freelancerWallet as Address,
                            amount,
                            hash32,
                          ],
                        });
                      } catch (err) {
                        setOnchainError(
                          err instanceof Error
                            ? err.message
                            : "Unable to submit on-chain transaction."
                        );
                      }
                    }}
                    className={btnPrimary}
                  >
                    {matchingOnChainJob ? (
                      "Job already created"
                    ) : isSyncingOnChainJob ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing job...
                      </>
                    ) : isTxPending || receipt.isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating on-chain job...
                      </>
                    ) : (
                      "Create job on-chain"
                    )}
                  </button>
                </div>

                {txError ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
                  >
                    Transaction error: {txError.message}
                  </div>
                ) : null}
                {receipt.isSuccess ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs ${isDarkTheme ? "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                  >
                    On-chain job created successfully. The app is syncing it
                    now.
                  </div>
                ) : null}
                {matchingOnChainJob ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs ${isDarkTheme ? "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                  >
                    Linked to on-chain job #
                    {matchingOnChainJob.id.toString()}.
                  </div>
                ) : null}
                {onchainError ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
                  >
                    {onchainError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>

        {/* Right — AI Review sidebar */}
        <article className={`${panelClass} space-y-5 rounded-2xl p-6 lg:p-8`}>
          <div>
            <p
              className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
            >
              AI review
            </p>
            <h2
              className={`mt-1.5 text-xl font-bold tracking-tight ${titleClass}`}
            >
              Fairness analysis
            </h2>
          </div>

          <FairnessScore score={fairnessScore} />

          {hasUnfairClause ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-amber-400/20 bg-amber-500/[0.06] text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              AI flagged potentially unfair clauses. Review suggestions
              carefully before accepting.
            </div>
          ) : null}

          {analysisError ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              {analysisError}
            </div>
          ) : null}

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleAnalyze}
            className={`${actionChipClass} inline-flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/20 disabled:opacity-50`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              "Run AI fairness analysis"
            )}
          </button>

          <ClauseAnalysis clauses={clauseItems} isLoading={isAnalyzing} />
        </article>
      </section>
    </div>
  );
}
