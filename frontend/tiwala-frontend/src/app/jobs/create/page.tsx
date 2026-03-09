"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { parseUnits, isAddress, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import ClauseAnalysis, {
  type ClauseItem,
} from "@/components/ai/clause-analysis";
import FairnessScore from "@/components/ai/fairness-score";
import { useAppTheme } from "@/components/layout/theme-context";
import { tiwalaEscrowAbi, TIWALA_ESCROW_ADDRESS } from "@/lib/contract";
import { getStoredProfile } from "@/lib/profile";

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

async function sha256ToBytes32(file: File): Promise<`0x${string}`> {
  const bytes = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

export default function CreateJobPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { theme } = useAppTheme();
  const { data: txHash, error: txError, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  const isDarkTheme = theme === "dark";
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
  const inputClass = isDarkTheme
    ? "h-11 w-full rounded-xl border border-white/14 bg-black/40 px-4 text-white outline-none transition placeholder:text-white/40 focus:border-violet-400/50"
    : "h-11 w-full rounded-xl border border-[#e1e4f0] bg-white px-4 text-[#11131b] outline-none transition placeholder:text-[#73788b] focus:border-violet-400";
  const textareaClass = isDarkTheme
    ? "min-h-28 w-full rounded-xl border border-white/14 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/40 focus:border-violet-400/50"
    : "min-h-28 w-full rounded-xl border border-[#e1e4f0] bg-white px-4 py-3 text-[#11131b] outline-none transition placeholder:text-[#73788b] focus:border-violet-400";

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [freelancerWallet, setFreelancerWallet] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [analysisRaw, setAnalysisRaw] = useState<AIResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const profile = useMemo(() => {
    if (!address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address]);

  const canCreate = profile?.role === "employer" || profile?.role === "both";
  const fairnessScore = analysisRaw ? extractScore(analysisRaw) : null;
  const clauseItems = analysisRaw ? extractClauses(analysisRaw) : [];
  const hasUnfairClause = clauseItems.some((item) => !item.isFair);

  const analyzeFile = async () => {
    setAnalysisError("");
    if (!contractFile) {
      setAnalysisError("Please upload a PDF contract first.");
      return;
    }
    if (contractFile.type !== "application/pdf") {
      setAnalysisError("Only PDF files are supported right now.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", contractFile);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI error.";
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    if (!isConnected || !address) {
      setSubmitError("Connect your wallet first.");
      return;
    }
    if (chainId !== 11155111) {
      setSubmitError("Switch to Sepolia before creating a job.");
      return;
    }
    if (!canCreate) {
      setSubmitError("Only Employer or Both role can create jobs.");
      return;
    }
    if (!jobTitle.trim() || !jobDescription.trim()) {
      setSubmitError("Job title and description are required.");
      return;
    }
    if (!isAddress(freelancerWallet)) {
      setSubmitError("Freelancer wallet address is invalid.");
      return;
    }
    if (!amountInput || Number(amountInput) <= 0) {
      setSubmitError("Amount must be greater than 0.");
      return;
    }
    if (!contractFile) {
      setSubmitError("Upload a contract PDF before creating a job.");
      return;
    }

    try {
      const amount = parseUnits(amountInput, 6);
      const contractHash = await sha256ToBytes32(contractFile);

      writeContract({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "createJob",
        args: [freelancerWallet as Address, amount, contractHash],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit transaction.";
      setSubmitError(message);
    }
  };

  if (!isConnected) {
    return (
      <div className={isDarkTheme ? "text-white" : "text-[#141621]"}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Create Job
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Connect wallet to continue
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Connect your wallet from the navbar to create and fund escrow jobs.
          </p>
        </section>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className={isDarkTheme ? "text-white" : "text-[#141621]"}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Create Job
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Employer access required
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Your current role is <span className="capitalize font-medium">{profile?.role ?? "unknown"}</span>.
            Update your profile role to Employer or Both before creating jobs.
          </p>
          <Link
            className={`${actionChipClass} mt-6 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/20`}
            href="/settings/profile"
          >
            Open Profile Settings
          </Link>
        </section>
      </div>
    );
  }

  const fileInputClass = isDarkTheme
    ? "block w-full rounded-xl border border-white/14 bg-black/40 p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-2 file:text-white/90 hover:file:bg-white/[0.1]"
    : "block w-full rounded-xl border border-[#e1e4f0] bg-[#fafbff] p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[#e8ecf4] file:px-3 file:py-2 file:text-[#2a3040] hover:file:bg-[#dce2f0]";

  return (
    <div className={isDarkTheme ? "text-white" : "text-[#141621]"}>
      <section className="mx-auto grid w-full max-w-[1580px] gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Create Job
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            New escrow job
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Submit contract details, run fairness analysis, then write <code className="text-violet-400/80">createJob()</code> on-chain.
          </p>

          {chainId !== 11155111 ? (
            <p className={`mt-4 rounded-xl border p-4 text-sm ${isDarkTheme ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              You are on chain {chainId}. Switch to Sepolia before submitting.
            </p>
          ) : null}

          <form className="mt-6 space-y-5" onSubmit={handleCreateJob}>
            <section className={`${subtlePanelClass} rounded-xl p-4`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Job details</p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>Title & description</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                    Job title
                  </label>
                  <input
                    className={inputClass}
                    onChange={(event) => setJobTitle(event.target.value)}
                    placeholder="Landing page redesign"
                    value={jobTitle}
                  />
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                    Job description
                  </label>
                  <textarea
                    className={textareaClass}
                    onChange={(event) => setJobDescription(event.target.value)}
                    placeholder="Describe scope, timeline, and deliverables."
                    value={jobDescription}
                  />
                </div>
              </div>
            </section>

            <section className={`${subtlePanelClass} rounded-xl p-4`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>On-chain params</p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>Freelancer & amount</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                    Freelancer wallet
                  </label>
                  <input
                    className={inputClass}
                    onChange={(event) => setFreelancerWallet(event.target.value)}
                    placeholder="0x..."
                    value={freelancerWallet}
                  />
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                    Amount (USDT)
                  </label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    onChange={(event) => setAmountInput(event.target.value)}
                    placeholder="150.00"
                    value={amountInput}
                  />
                </div>
              </div>
            </section>

            <section className={`${subtlePanelClass} rounded-xl p-4`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Contract</p>
              <h2 className={`mt-2 text-lg font-semibold tracking-tight ${titleClass}`}>Contract PDF</h2>
              <div className="mt-4">
                <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                  Upload contract
                </label>
                <input
                  accept="application/pdf"
                  className={fileInputClass}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setContractFile(file);
                  }}
                  type="file"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-xs ${mutedTextClass}`}>
                    No contract yet? Generate one in the contract builder, export as PDF, then upload here.
                  </p>
                  <Link
                    href="/contracts/create"
                    className={`inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold transition ${chipClass} hover:border-violet-300/50 hover:bg-violet-500/10`}
                  >
                    Create contract
                  </Link>
                </div>
              </div>
            </section>

            {submitError ? (
              <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
                {submitError}
              </p>
            ) : null}

            {txError ? (
              <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
                Transaction error: {txError.message}
              </p>
            ) : null}

            {txHash ? (
              <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200" : "border-cyan-200 bg-cyan-50 text-cyan-800"}`}>
                Transaction sent: {txHash}
              </p>
            ) : null}

            {receipt.isLoading ? (
              <p className={`rounded-xl border p-4 text-sm ${subtlePanelClass} ${mutedTextClass}`}>
                Waiting for on-chain confirmation...
              </p>
            ) : null}

            {receipt.isSuccess ? (
              <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                Job created successfully on-chain.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                disabled={isPending || receipt.isLoading}
                type="submit"
              >
                {isPending ? "Confirm in wallet..." : "Create job on-chain"}
              </button>
              <button
                className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${chipClass} hover:border-violet-300/50 hover:bg-violet-500/10`}
                disabled={isAnalyzing}
                onClick={analyzeFile}
                type="button"
              >
                {isAnalyzing ? "Analyzing..." : "Run AI fairness analysis"}
              </button>
            </div>
          </form>
        </article>

        <article className={`${panelClass} space-y-4 rounded-xl p-6 lg:p-7`}>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>AI review</p>
          <h2 className={`text-2xl font-semibold tracking-tight ${titleClass}`}>Fairness analysis</h2>
          <FairnessScore score={fairnessScore} />

          {hasUnfairClause ? (
            <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              AI flagged potentially unfair clauses. Review suggestions before submitting.
            </p>
          ) : null}

          {analysisError ? (
            <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
              {analysisError}
            </p>
          ) : null}

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
