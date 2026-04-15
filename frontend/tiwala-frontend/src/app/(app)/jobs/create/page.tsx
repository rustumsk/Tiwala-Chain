"use client";

import { FormEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import ClauseAnalysis from "@/components/ai/clause-analysis";
import FairnessScore from "@/components/ai/fairness-score";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { type AIResponse, extractScore, extractClauses } from "@/lib/ai-parsing";
import { getStoredAuthSession } from "@/lib/auth";
import { createJobOffer, uploadJobContract } from "@/lib/jobs";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";
import { convertProposalToOffer } from "@/lib/proposals";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  DollarSign,
  FileText,
  Sparkles,
  Upload,
  User,
  Wallet,
  X,
} from "lucide-react";

function readSearchParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
  border,
  subtle,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  children: React.ReactNode;
  border: string;
  subtle: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${border} ${subtle}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Icon size={14} className="text-violet-500" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-none">{title}</p>
          {hint && <p className="mt-0.5 text-[11px] text-current opacity-50">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function CreateJobPage() {
  const { address, isConnected } = useAccount();
  const {
    isDarkTheme,
    pageClass,
    panelClass,
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    chipClass,
    actionChipClass,
    inputClass,
    textareaClass,
  } = useThemeStyles();

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [freelancerWallet, setFreelancerWallet] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analysisRaw, setAnalysisRaw] = useState<AIResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [proposalId, setProposalId] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const canCreate = profile?.role === "employer" || profile?.role === "both";

  useLayoutEffect(() => {
    const pid = Number(readSearchParam("proposalId"));
    setProposalId(Number.isFinite(pid) && pid > 0 ? pid : 0);
    setJobTitle(readSearchParam("title"));
    setJobDescription(readSearchParam("description"));
    setFreelancerWallet(readSearchParam("freelancer"));
    setAmountInput(readSearchParam("amount"));
  }, []);

  const isProposalFlow = proposalId > 0;

  const fairnessScore = analysisRaw ? extractScore(analysisRaw) : null;
  const clauseItems = analysisRaw ? extractClauses(analysisRaw) : [];
  const hasUnfairClause = clauseItems.some((c) => !c.isFair);

  const handleFile = useCallback((file: File | null) => {
    setContractFile(file);
    setAnalysisRaw(null);
    setAnalysisError("");
  }, []);

  const analyzeFile = async () => {
    setAnalysisError("");
    if (!contractFile) { setAnalysisError("Upload a PDF contract first."); return; }
    if (contractFile.type !== "application/pdf") { setAnalysisError("Only PDF files are supported."); return; }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", contractFile);
      const response = await fetch("/api/ai/evaluate-file", { method: "POST", body: formData });
      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(details?.error ? `${details.error} (${response.status})` : `AI service error (${response.status})`);
      }
      setAnalysisRaw((await response.json()) as AIResponse);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Unknown AI error.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!isConnected || !address) { setSubmitError("Connect your wallet first."); return; }
    if (!canCreate) { setSubmitError("Only Employer role can create jobs."); return; }
    if (!jobTitle.trim() || !jobDescription.trim()) { setSubmitError("Job title and description are required."); return; }
    if (!isProposalFlow && !isAddress(freelancerWallet)) { setSubmitError("Freelancer wallet address is invalid."); return; }
    if (!amountInput || Number(amountInput) <= 0) { setSubmitError("Amount must be greater than 0."); return; }
    if (!contractFile) { setSubmitError("Upload a contract PDF before creating a job."); return; }

    setIsSubmitting(true);
    try {
      const session = getStoredAuthSession();
      if (!session || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
        setSubmitError("Please sign in with your wallet first.");
        return;
      }

      const upload = await uploadJobContract(session, contractFile);

      if (isProposalFlow) {
        await convertProposalToOffer(session, proposalId, {
          title: jobTitle.trim(),
          description: jobDescription.trim(),
          amountUsdt: Number(amountInput.trim()),
          contractKey: upload.key,
          contractHash: upload.hash,
        });
      } else {
        await createJobOffer(session, {
          freelancerWallet: freelancerWallet.toLowerCase(),
          title: jobTitle.trim(),
          description: jobDescription.trim(),
          amountUsdt: amountInput.trim(),
          contractKey: upload.key,
          contractHash: upload.hash,
        });
      }

      const msg = isProposalFlow
        ? "Formal offer created from the selected proposal."
        : "Job offer created and sent to the freelancer.";
      setSubmitSuccess(msg);
      notifySuccess(msg);
      setJobTitle("");
      setJobDescription("");
      setFreelancerWallet("");
      setAmountInput("");
      setContractFile(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to create job offer.";
      setSubmitError(msg);
      notifyError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const border = isDarkTheme ? "border-white/[0.07]" : "border-[#e5e8f2]";
  const subtle = isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]";

  if (!isConnected) {
    return (
      <div className={pageClass}>
        <div className={`mx-auto max-w-[560px] rounded-2xl border p-10 text-center ${border} ${subtle}`}>
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-violet-500/10">
            <Wallet size={22} className="text-violet-500" />
          </span>
          <p className={`text-base font-semibold ${titleClass}`}>Connect your wallet</p>
          <p className={`mt-1.5 text-sm ${mutedTextClass}`}>Connect your wallet from the navbar to create and fund escrow jobs.</p>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className={pageClass}>
        <div className={`mx-auto max-w-[560px] rounded-2xl border p-10 text-center ${border} ${subtle}`}>
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10">
            <Briefcase size={22} className="text-amber-500" />
          </span>
          <p className={`text-base font-semibold ${titleClass}`}>Employer access required</p>
          <p className={`mt-1.5 text-sm ${mutedTextClass}`}>
            Your current role is <span className="font-medium capitalize">{profile?.role ?? "unknown"}</span>. Switch to Employer to create jobs.
          </p>
          <Link href="/settings/profile" className={`mt-5 inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
            Profile settings
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="mx-auto w-full max-w-[1200px]">

        {/* Page header */}
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
            {isProposalFlow ? "From proposal" : "New offer"}
          </p>
          <h1 className={`mt-1 text-2xl font-bold tracking-tight ${titleClass}`}>
            Create job offer
          </h1>
          <p className={`mt-1 text-sm ${mutedTextClass}`}>
            {isProposalFlow
              ? "Review the pre-filled details from the selected proposal, attach a contract, and send the formal offer."
              : "Fill in the job details, upload a signed contract PDF, and send the offer to your freelancer."}
          </p>
        </div>

        {/* Proposal-flow context banner */}
        {isProposalFlow && (
          <div className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 ${isDarkTheme ? "border-violet-400/20 bg-violet-500/8" : "border-violet-200 bg-violet-50"}`}>
            <Sparkles size={15} className="mt-0.5 shrink-0 text-violet-500" />
            <div>
              <p className={`text-xs font-semibold ${isDarkTheme ? "text-violet-300" : "text-violet-700"}`}>
                Proposal flow — freelancer wallet and amount pre-filled
              </p>
              <p className={`mt-0.5 text-xs ${isDarkTheme ? "text-violet-300/70" : "text-violet-600/80"}`}>
                The freelancer wallet and proposed amount have been pulled from the accepted proposal. You can adjust the amount before sending.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleCreateJob}>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">

            {/* ── Left: form ── */}
            <div className="space-y-4">

              {/* Job details */}
              <Section icon={FileText} title="Job details" border={border} subtle={subtle}>
                <div className="space-y-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputClass}
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Landing page redesign"
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      className={`${textareaClass} min-h-[100px]`}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Describe the scope, deliverables, and timeline."
                    />
                  </div>
                </div>
              </Section>

              {/* Freelancer & amount */}
              <Section icon={Wallet} title="Counterparty & payment" border={border} subtle={subtle}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Freelancer wallet <span className="text-red-400">*</span>
                    </label>
                    {isProposalFlow ? (
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${border} ${isDarkTheme ? "bg-white/[0.03]" : "bg-white"}`}>
                        <User size={13} className={`shrink-0 ${mutedTextClass}`} />
                        <span className={`flex-1 truncate font-mono text-xs ${titleClass}`}>
                          {freelancerWallet || "—"}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDarkTheme ? "bg-violet-500/15 text-violet-300" : "bg-violet-100 text-violet-700"}`}>
                          locked
                        </span>
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        value={freelancerWallet}
                        onChange={(e) => setFreelancerWallet(e.target.value)}
                        placeholder="0x…"
                        spellCheck={false}
                      />
                    )}
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Amount (USDT) <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign size={13} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextClass}`} />
                      <input
                        className={`${inputClass} pl-8`}
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </Section>

              {/* Contract upload */}
              <Section
                icon={Upload}
                title="Contract PDF"
                hint="Upload the signed contract — it will be hashed and stored on-chain"
                border={border}
                subtle={subtle}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />

                {contractFile ? (
                  <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                    <FileText size={16} className="shrink-0 text-violet-400" />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${titleClass}`}>{contractFile.name}</p>
                      <p className={`text-xs ${mutedTextClass}`}>{(contractFile.size / 1024).toFixed(1)} KB · PDF</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { handleFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className={`shrink-0 rounded-lg p-1 transition hover:text-red-500 ${mutedTextClass}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFile(file);
                    }}
                    className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 transition ${
                      isDragging
                        ? "border-violet-400 bg-violet-500/5"
                        : `${isDarkTheme ? "border-white/10 hover:border-violet-400/40 hover:bg-violet-500/5" : "border-[#dde1f0] hover:border-violet-300 hover:bg-violet-50/50"}`
                    }`}
                  >
                    <Upload size={20} className={isDragging ? "text-violet-400" : mutedTextClass} />
                    <div className="text-center">
                      <p className={`text-sm font-medium ${isDragging ? (isDarkTheme ? "text-violet-300" : "text-violet-700") : titleClass}`}>
                        Drop your PDF here, or click to browse
                      </p>
                      <p className={`mt-0.5 text-xs ${mutedTextClass}`}>PDF only · max 10 MB</p>
                    </div>
                  </button>
                )}

                {/* Inline AI trigger */}
                <div className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                  <div>
                    <p className={`text-xs font-semibold ${titleClass}`}>AI fairness analysis</p>
                    <p className={`text-[11px] ${mutedTextClass}`}>
                      {analysisRaw ? "Analysis complete — see results on the right." : "Run before sending to flag risky clauses."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!contractFile || isAnalyzing}
                    onClick={() => void analyzeFile()}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      analysisRaw
                        ? isDarkTheme ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : chipClass
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Analyzing…
                      </>
                    ) : analysisRaw ? (
                      <><CheckCircle2 size={12} /> Re-analyze</>
                    ) : (
                      <><Sparkles size={12} /> Analyze</>
                    )}
                  </button>
                </div>

                {analysisError && (
                  <p className={`mt-2 rounded-xl border px-3 py-2.5 text-xs ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {analysisError}
                  </p>
                )}

                <p className={`mt-3 text-xs ${mutedTextClass}`}>
                  No contract yet?{" "}
                  <Link href="/contracts/create" className="font-medium text-violet-500 hover:underline">
                    Build one in the contract builder
                  </Link>
                </p>
              </Section>

              {/* Errors / success */}
              {submitError && (
                <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  {submitSuccess}
                </div>
              )}

              {/* Submit */}
              <div className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <div>
                  <p className={`text-sm font-semibold ${titleClass}`}>Ready to send?</p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    {hasUnfairClause ? "AI flagged unfair clauses — review the analysis first." : "The offer will be sent to the freelancer for review."}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    hasUnfairClause
                      ? isDarkTheme ? "border border-amber-400/30 bg-amber-500/10 text-amber-300" : "border border-amber-200 bg-amber-50 text-amber-700"
                      : actionChipClass
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Sending…
                    </>
                  ) : (
                    <>
                      {hasUnfairClause && <AlertTriangle size={14} />}
                      Send offer
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ── Right: AI panel ── */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className={`rounded-2xl border p-5 space-y-4 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Sparkles size={14} className="text-violet-500" />
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${titleClass}`}>AI contract review</p>
                    <p className={`text-[11px] ${mutedTextClass}`}>Powered by your local model</p>
                  </div>
                </div>

                <FairnessScore score={fairnessScore} />

                {hasUnfairClause && (
                  <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${isDarkTheme ? "border-amber-400/20 bg-amber-500/8 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Flagged clauses detected — review suggestions before sending.
                  </div>
                )}

                <ClauseAnalysis clauses={clauseItems} isLoading={isAnalyzing} />

                {!isAnalyzing && !analysisRaw && (
                  <div className={`rounded-xl border border-dashed p-5 text-center ${isDarkTheme ? "border-white/10" : "border-[#dde1f0]"}`}>
                    <Sparkles size={18} className={`mx-auto mb-2 ${mutedTextClass}`} />
                    <p className={`text-xs font-medium ${titleClass}`}>No analysis yet</p>
                    <p className={`mt-0.5 text-[11px] ${mutedTextClass}`}>Upload a PDF and click Analyze to review contract fairness.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}
