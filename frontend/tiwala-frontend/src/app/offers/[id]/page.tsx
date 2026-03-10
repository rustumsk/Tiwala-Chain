"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits, type Address } from "viem";
import { FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  acceptJobOffer,
  declineJobOffer,
  downloadJobContractBlob,
  fetchJobById,
  type JobResponse,
} from "@/lib/jobs";
import { getStoredAuthSession } from "@/lib/auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";
import ClauseAnalysis, {
  type ClauseItem,
} from "@/components/ai/clause-analysis";
import FairnessScore from "@/components/ai/fairness-score";
import { tiwalaEscrowAbi, TIWALA_ESCROW_ADDRESS } from "@/lib/contract";

type AIResponse = Record<string, unknown>;

function extractScore(payload: AIResponse): number | null {
  const direct = payload.fairness_score ?? payload.score ?? payload.overall_score;
  if (typeof direct === "number") return Math.max(0, Math.min(100, direct));
  return null;
}

function extractClauses(payload: AIResponse): ClauseItem[] {
  const rawClauses = payload.clauses ?? payload.analysis ?? payload.results;
  if (!Array.isArray(rawClauses)) return [];

  return rawClauses
    .map((item) => {
      if (typeof item !== "object" || !item) return null;
      const record = item as Record<string, unknown>;
      const title =
        (typeof record.clause === "string" && record.clause) ||
        (typeof record.text === "string" && record.text) ||
        (typeof record.title === "string" && record.title) ||
        "Clause";

      const label =
        (typeof record.label === "string" && record.label.toLowerCase()) ||
        (typeof record.verdict === "string" && record.verdict.toLowerCase()) ||
        "";
      const isFair =
        label === "fair" ||
        label === "safe" ||
        record.is_fair === true ||
        record.isFair === true;

      const suggestion =
        (typeof record.suggestion === "string" && record.suggestion) ||
        (typeof record.recommendation === "string" && record.recommendation) ||
        undefined;

      return { title, isFair, suggestion };
    })
    .filter((item): item is ClauseItem => Boolean(item));
}

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
  const { isDarkTheme } = useAppTheme();

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
  const [amountInput, setAmountInput] = useState("");

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected || !address) return;
    const session = getStoredAuthSession();
    if (!session || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
      return;
    }

    const idNumber = Number(params?.id);
    if (!Number.isFinite(idNumber) || idNumber <= 0) {
      setJobError("Invalid offer id.");
      setLoadingJob(false);
      return;
    }

    let active = true;
    setLoadingJob(true);
    setJobError("");

    fetchJobById(session, idNumber)
      .then((data) => {
        if (!active) return;
        setJob(data);
      })
      .catch((err) => {
        if (!active) return;
        setJobError(err instanceof Error ? err.message : "Failed to load offer.");
      })
      .finally(() => {
        if (!active) return;
        setLoadingJob(false);
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, params?.id]);

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
  const primaryButtonClass = isDarkTheme
    ? "inline-flex h-11 items-center justify-center rounded-xl border border-emerald-300/40 bg-emerald-500/25 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/70 hover:bg-emerald-500/35 disabled:opacity-60"
    : "inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400/70 hover:bg-emerald-500/20 disabled:opacity-60";
  const secondaryButtonClass = isDarkTheme
    ? "inline-flex h-11 items-center justify-center rounded-xl border border-red-300/40 bg-red-500/15 px-5 text-sm font-semibold text-red-100 transition hover:border-red-200/70 hover:bg-red-500/25 disabled:opacity-60"
    : "inline-flex h-11 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/10 px-5 text-sm font-semibold text-red-800 transition hover:border-red-400/70 hover:bg-red-500/20 disabled:opacity-60";

  const fairnessScore = analysisRaw ? extractScore(analysisRaw) : null;
  const clauseItems = analysisRaw ? extractClauses(analysisRaw) : [];
  const hasUnfairClause = clauseItems.some((item) => !item.isFair);

  const isEmployerView =
    !!job &&
    !!profile &&
    (profile.role === "employer" || profile.role === "both") &&
    job.employerWallet.toLowerCase() === profile.wallet.toLowerCase();

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

      const response = await fetch("http://localhost:8000/evaluate/file", {
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
      router.replace("/jobs"); // later can go to a specific job detail
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

  if (!isConnected) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job offer
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Connect wallet to continue
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Connect your wallet from the navbar to review job offers sent to you.
          </p>
        </section>
      </div>
    );
  }

  if (loadingJob) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto flex w-full max-w-[1580px] items-center justify-center ${panelClass} rounded-xl px-6 py-16`}
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
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job offer
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Unable to load offer
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            {jobError || "Offer not found or you are not allowed to view it."}
          </p>
        </section>
      </div>
    );
  }

  const isPending = job.status === "PendingOffer" || job.status === "pendingoffer";
  const isAccepted = job.status === "Accepted" || job.status === "accepted";

  return (
    <div className={pageClass}>
      <section className="mx-auto grid w-full max-w-[1580px] gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job offer
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            {job.title || `Offer #${job.id}`}
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Review this contract and decide whether to accept or decline the work.
          </p>

          <section className="mt-6 space-y-4">
            <div className={`${subtlePanelClass} rounded-xl p-4`}>
              <p
                className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
              >
                Summary
              </p>
              <h2
                className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}
              >
                Details from employer
              </h2>
              <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
                {job.description || "No additional description provided."}
              </p>
            </div>

            <div className={`${subtlePanelClass} rounded-xl p-4`}>
              <p
                className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
              >
                Offered amount
              </p>
              <p className={`mt-2 text-sm font-semibold ${titleClass}`}>
                {job.amountUsdt.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}{" "}
                USDT
              </p>
            </div>

            <div className={`${subtlePanelClass} rounded-xl p-4`}>
              <p
                className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
              >
                Parties
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className={`text-xs ${tinyLabelClass}`}>Employer</p>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    {job.employerWallet}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${tinyLabelClass}`}>You (freelancer)</p>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    {job.freelancerWallet}
                  </p>
                </div>
              </div>
            </div>

            <div className={`${subtlePanelClass} flex items-center justify-between rounded-xl p-4`}>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                    isDarkTheme ? "bg-white/[0.06]" : "bg-[#eceffd]"
                  }`}
                >
                  <FileText className={isDarkTheme ? "text-violet-200" : "text-violet-600"} size={18} />
                </span>
                <div>
                  <p className={`text-sm font-medium ${titleClass}`}>Contract PDF</p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    Stored off-chain with integrity hash on the job record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleViewContract}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-300/40 bg-violet-500/15 px-3 text-xs font-semibold text-violet-100 hover:border-violet-200/70 hover:bg-violet-500/25"
              >
                View contract
              </button>
            </div>
          </section>

          {actionError ? (
            <p
              className={`mt-5 rounded-xl border p-4 text-sm ${
                isDarkTheme
                  ? "border-red-400/30 bg-red-500/10 text-red-200"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {actionError}
            </p>
          ) : null}

          {isEmployerView ? (
            <div className="mt-5 space-y-3">
              <h3 className={`text-sm font-semibold ${titleClass}`}>
                Escrow funding (on-chain)
              </h3>
              <p className={`text-sm ${mutedTextClass}`}>
                Once the freelancer accepts, you can create the escrow job on-chain and
                fund it with USDT. This locks funds until work is completed or disputed.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-sm ${mutedTextClass}`}>
                  Offered amount:{" "}
                  <span className={`font-semibold ${titleClass}`}>
                    {job.amountUsdt.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    USDT
                  </span>
                </p>
                <button
                  type="button"
                  disabled={
                    !isAccepted ||
                    isTxPending ||
                    receipt.isLoading
                  }
                  onClick={async () => {
                    if (!job || !address) return;
                    setOnchainError("");

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
                      const hash32 = `0x${job.contractHash}` as `0x${string}`;

                      writeContract({
                        address: TIWALA_ESCROW_ADDRESS,
                        abi: tiwalaEscrowAbi,
                        functionName: "createJob",
                        args: [job.freelancerWallet as Address, amount, hash32],
                      });
                    } catch (err) {
                      setOnchainError(
                        err instanceof Error
                          ? err.message
                          : "Unable to submit on-chain transaction."
                      );
                    }
                  }}
                  className={primaryButtonClass}
                >
                  {isTxPending || receipt.isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating on-chain job...
                    </>
                  ) : (
                    "Create job on-chain"
                  )}
                </button>
              </div>
              {txError ? (
                <p
                  className={`rounded-xl border p-3 text-xs ${
                    isDarkTheme
                      ? "border-red-400/30 bg-red-500/10 text-red-200"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  Transaction error: {txError.message}
                </p>
              ) : null}
              {receipt.isSuccess ? (
                <p
                  className={`rounded-xl border p-3 text-xs ${
                    isDarkTheme
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  On-chain job created successfully. You can now see it on the Jobs page
                  under your employer queue.
                </p>
              ) : null}
              {onchainError ? (
                <p
                  className={`rounded-xl border p-3 text-xs ${
                    isDarkTheme
                      ? "border-red-400/30 bg-red-500/10 text-red-200"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {onchainError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!isPending || isAccepting}
              onClick={handleAccept}
              className={primaryButtonClass}
            >
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accepting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept offer
                </>
              )}
            </button>
            <button
              type="button"
              disabled={!isPending || isDeclining}
              onClick={handleDecline}
              className={secondaryButtonClass}
            >
              {isDeclining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Declining...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Decline
                </>
              )}
            </button>
          </div>
        </article>

        <article className={`${panelClass} space-y-4 rounded-xl p-6 lg:p-7`}>
          <p
            className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
          >
            AI review
          </p>
          <h2 className={`text-2xl font-semibold tracking-tight ${titleClass}`}>
            Fairness analysis
          </h2>
          <FairnessScore score={fairnessScore} />

          {hasUnfairClause ? (
            <p
              className={`rounded-xl border p-4 text-sm ${
                isDarkTheme
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              AI flagged potentially unfair clauses. Review suggestions carefully
              before accepting.
            </p>
          ) : null}

          {analysisError ? (
            <p
              className={`rounded-xl border p-4 text-sm ${
                isDarkTheme
                  ? "border-red-400/30 bg-red-500/10 text-red-200"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {analysisError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleAnalyze}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-violet-300/40 bg-violet-500/20 px-4 text-xs font-semibold text-violet-50 transition hover:border-violet-200/70 hover:bg-violet-500/30 disabled:opacity-60"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              "Run AI fairness analysis"
            )}
          </button>

          <ClauseAnalysis clauses={clauseItems} />

          {analysisRaw ? (
            <details className={`${subtlePanelClass} rounded-xl p-4`}>
              <summary className={`cursor-pointer text-sm font-medium ${titleClass}`}>
                Raw AI response
              </summary>
              <pre className={`mt-3 overflow-auto text-xs ${mutedTextClass}`}>
                {JSON.stringify(analysisRaw, null, 2)}
              </pre>
            </details>
          ) : null}
        </article>
      </section>
    </div>
  );
}

