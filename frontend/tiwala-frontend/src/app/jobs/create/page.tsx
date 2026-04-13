"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import {
  useAccount,
} from "wagmi";
import ClauseAnalysis from "@/components/ai/clause-analysis";
import FairnessScore from "@/components/ai/fairness-score";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { type AIResponse, extractScore, extractClauses } from "@/lib/ai-parsing";
import { getStoredAuthSession } from "@/lib/auth";
import { createJobOffer, uploadJobContract } from "@/lib/jobs";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";

export default function CreateJobPage() {
  const { address, isConnected } = useAccount();
  const { isDarkTheme, panelClass, subtlePanelClass, mutedTextClass, tinyLabelClass, titleClass, chipClass, actionChipClass, inputClass, textareaClass } = useThemeStyles();

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [freelancerWallet, setFreelancerWallet] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [analysisRaw, setAnalysisRaw] = useState<AIResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const canCreate = profile?.role === "employer";
  const fairnessScore = analysisRaw ? extractScore(analysisRaw) : null;
  const clauseItems = analysisRaw ? extractClauses(analysisRaw) : [];
  const hasUnfairClause = clauseItems.some((c) => !c.isFair);

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
    setSubmitSuccess("");

    if (!isConnected || !address) {
      setSubmitError("Connect your wallet first.");
      return;
    }
    if (!canCreate) {
      setSubmitError("Only Employer role can create jobs.");
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

    setIsSubmitting(true);
    try {
      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== address.toLowerCase()
      ) {
        setSubmitError("Please sign in with your wallet first.");
        return;
      }

      const upload = await uploadJobContract(session, contractFile);

      await createJobOffer(session, {
        freelancerWallet: freelancerWallet.toLowerCase(),
        title: jobTitle.trim(),
        description: jobDescription.trim(),
        amountUsdt: amountInput.trim(),
        contractKey: upload.key,
        contractHash: upload.hash,
      });

      setSubmitSuccess("Job offer created and sent to the freelancer.");
      notifySuccess("Job offer created and sent to the freelancer.");
      setJobTitle("");
      setJobDescription("");
      setFreelancerWallet("");
      setAmountInput("");
      setContractFile(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create job offer.";
      setSubmitError(message);
      notifyError(message);
    } finally {
      setIsSubmitting(false);
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
            Your role must be Employer before creating jobs.
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
            Submit contract details, run fairness analysis, then send a job offer to your freelancer. Escrow and on-chain signing happen after they accept.
          </p>

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

            {submitSuccess ? (
              <p className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {submitSuccess}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Sending..." : "Send job offer"}
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

          <ClauseAnalysis clauses={clauseItems} isLoading={isAnalyzing} />
        </article>
      </section>
    </div>
  );
}
