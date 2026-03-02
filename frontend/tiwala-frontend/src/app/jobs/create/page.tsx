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
  const { data: txHash, error: txError, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

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
      <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <h1 className="text-2xl font-semibold">Create Job</h1>
          <p className="mt-3 text-sm text-slate-300">
            Connect your wallet from the navbar to continue.
          </p>
        </section>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <h1 className="text-2xl font-semibold">Employer Access Required</h1>
          <p className="mt-3 text-sm text-slate-300">
            Your current role is <span className="capitalize">{profile?.role ?? "unknown"}</span>.
            Update onboarding role to Employer or Both before creating jobs.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center rounded-xl border border-slate-700 px-4 text-sm text-slate-200 hover:border-slate-500"
            href="/onboarding"
          >
            Go to Onboarding
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#060a14] px-6 py-12 text-slate-100 md:px-12">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <h1 className="text-2xl font-semibold">Create a New Job</h1>
          <p className="mt-2 text-sm text-slate-300">
            Submit contract details, run fairness analysis, then write `createJob()` on-chain.
          </p>

          {chainId !== 11155111 ? (
            <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              You are on chain {chainId}. Switch to Sepolia before submitting.
            </p>
          ) : null}

          <form className="mt-6 space-y-5" onSubmit={handleCreateJob}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Job Title
              </label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-slate-100 outline-none transition focus:border-teal-300"
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Landing page redesign"
                value={jobTitle}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Job Description
              </label>
              <textarea
                className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition focus:border-teal-300"
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Describe scope, timeline, and deliverables."
                value={jobDescription}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Freelancer Wallet
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-slate-100 outline-none transition focus:border-teal-300"
                  onChange={(event) => setFreelancerWallet(event.target.value)}
                  placeholder="0x..."
                  value={freelancerWallet}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Amount (USDT)
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-slate-100 outline-none transition focus:border-teal-300"
                  inputMode="decimal"
                  onChange={(event) => setAmountInput(event.target.value)}
                  placeholder="150.00"
                  value={amountInput}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Contract PDF
              </label>
              <input
                accept="application/pdf"
                className="block w-full rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100 hover:file:bg-slate-600"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setContractFile(file);
                }}
                type="file"
              />
            </div>

            {submitError ? (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {submitError}
              </p>
            ) : null}

            {txError ? (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                Transaction error: {txError.message}
              </p>
            ) : null}

            {txHash ? (
              <p className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
                Transaction sent: {txHash}
              </p>
            ) : null}

            {receipt.isLoading ? (
              <p className="rounded-lg border border-slate-600 bg-slate-900/80 p-3 text-sm text-slate-300">
                Waiting for on-chain confirmation...
              </p>
            ) : null}

            {receipt.isSuccess ? (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Job created successfully on-chain.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending || receipt.isLoading}
                type="submit"
              >
                {isPending ? "Confirm in wallet..." : "Create Job On-Chain"}
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-700 px-5 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
                disabled={isAnalyzing}
                onClick={analyzeFile}
                type="button"
              >
                {isAnalyzing ? "Analyzing..." : "Run AI Fairness Analysis"}
              </button>
            </div>
          </form>
        </article>

        <article className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/65 p-8">
          <h2 className="text-lg font-semibold text-slate-100">Fairness Analysis</h2>
          <FairnessScore score={fairnessScore} />

          {hasUnfairClause ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              AI flagged potentially unfair clauses. Review suggestions before submitting.
            </p>
          ) : null}

          {analysisError ? (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {analysisError}
            </p>
          ) : null}

          <ClauseAnalysis clauses={clauseItems} />

          {analysisRaw ? (
            <details className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
              <summary className="cursor-pointer text-sm text-slate-200">
                Raw AI response
              </summary>
              <pre className="mt-3 overflow-auto text-xs text-slate-300">
                {JSON.stringify(analysisRaw, null, 2)}
              </pre>
            </details>
          ) : null}
        </article>
      </section>
    </div>
  );
}
