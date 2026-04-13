"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Loader2, Search, Sparkles } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import FairnessScore from "@/components/ai/fairness-score";
import ClauseAnalysis from "@/components/ai/clause-analysis";
import {
  type AIResponse,
  type ParsedClause,
  extractScore,
  extractClauses,
} from "@/lib/ai-parsing";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
  "http://localhost:5067";

function toSafeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function PublicContractsPage() {
  const { theme } = useAppTheme();
  const isDarkTheme = theme === "dark";

  const [jobTitle, setJobTitle] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalAmountUsdt, setTotalAmountUsdt] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(
    "50% upfront, 50% on completion"
  );
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [customClauses, setCustomClauses] = useState<string[]>([""]);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [rawResult, setRawResult] = useState<AIResponse | null>(null);

  const contractText = useMemo(() => {
    const lines: string[] = [];
    lines.push("Freelancing Contract");
    lines.push("");
    lines.push(`Job Title: ${jobTitle || "—"}`);
    lines.push(`Employer: ${employerName || "—"}`);
    lines.push(`Freelancer: ${freelancerName || "—"}`);
    lines.push(`Start Date: ${startDate || "—"}`);
    lines.push(`End Date: ${endDate || "—"}`);
    lines.push("");
    lines.push("Project Description");
    lines.push(projectDescription || "—");
    lines.push("");
    lines.push("Compensation");
    lines.push(`Total Amount (USDT): ${totalAmountUsdt || "—"}`);
    lines.push(`Payment Terms: ${paymentTerms || "—"}`);
    lines.push("");
    lines.push("Deliverables");
    deliverables
      .map((d) => d.trim())
      .filter(Boolean)
      .forEach((d, idx) => lines.push(`${idx + 1}. ${d}`));
    lines.push("");
    lines.push("Additional Clauses");
    customClauses
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c, idx) => lines.push(`${idx + 1}. ${c}`));
    lines.push("");
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    return lines.join("\n");
  }, [
    customClauses,
    deliverables,
    employerName,
    endDate,
    freelancerName,
    jobTitle,
    paymentTerms,
    projectDescription,
    startDate,
    totalAmountUsdt,
  ]);

  const fairnessScore = rawResult ? extractScore(rawResult) : null;
  const clauseItems: ParsedClause[] = rawResult
    ? extractClauses(rawResult)
    : [];

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  async function evaluate() {
    setError("");
    setIsEvaluating(true);
    setRawResult(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/public/contracts/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: contractText }),
        }
      );
      const payload = (await res.json().catch(() => null)) as
        | AIResponse
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string })?.error ??
            `Request failed (${res.status}).`
        );
      }
      setRawResult(payload as AIResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setIsEvaluating(false);
    }
  }

  const panelClass = isDarkTheme
    ? "rounded-2xl border border-white/12 bg-black/32"
    : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  const inputClass = isDarkTheme
    ? "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50"
    : "h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";

  const textareaClass = isDarkTheme
    ? "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50"
    : "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";

  const labelClass = isDarkTheme
    ? "mb-2 block text-xs font-medium text-white/70"
    : "mb-2 block text-xs font-medium text-slate-600";

  const chipClass = isDarkTheme
    ? "rounded-xl border border-white/14 bg-white/[0.04] text-white/82"
    : "rounded-xl border border-slate-200 bg-slate-50 text-slate-700";

  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-slate-900";
  const mutedTextClass = isDarkTheme ? "text-white/60" : "text-slate-600";

  const primaryBtnClass = isDarkTheme
    ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-300/40 bg-violet-500/18 px-5 text-sm font-semibold text-violet-100 transition hover:border-violet-300/60 hover:bg-violet-500/22 disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      className={`themed-app-page min-h-screen px-4 py-8 md:px-8 ${
        isDarkTheme
          ? "bg-[#060912] text-white"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      <section className="mx-auto w-full max-w-6xl space-y-5">
        {/* Header */}
        <header className={`${panelClass} px-6 py-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                  isDarkTheme
                    ? "bg-violet-500/10 text-violet-300"
                    : "bg-violet-50 text-violet-600 ring-1 ring-violet-200"
                }`}
              >
                <Sparkles size={12} />
                Public Contract Studio
              </div>
              <h1
                className={`text-3xl font-semibold tracking-tight ${titleClass}`}
              >
                Create a contract, then check fairness
              </h1>
              <p className={`max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                This page is public and does not require wallet sign-in.
                Requests are rate-limited.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${chipClass} inline-flex items-center gap-2 px-4 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                onClick={() => void copyText(contractText)}
              >
                <Copy size={14} />
                Copy contract text
              </button>
              <button
                type="button"
                className={primaryBtnClass}
                onClick={() => void evaluate()}
                disabled={isEvaluating}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Evaluate fairness
                  </>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                isDarkTheme
                  ? "border-red-400/25 bg-red-500/10 text-red-100"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-red-500"
              />
              <span>{error}</span>
            </div>
          ) : null}
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: Form */}
          <section className={`${panelClass} p-6`}>
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tinyLabelClass}`}
            >
              Contract fields
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Job title</label>
                <input
                  className={inputClass}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Brand Redesign"
                />
              </div>
              <div>
                <label className={labelClass}>Total amount (USDT)</label>
                <input
                  className={inputClass}
                  value={totalAmountUsdt}
                  onChange={(e) => setTotalAmountUsdt(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelClass}>Employer</label>
                <input
                  className={inputClass}
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className={labelClass}>Freelancer</label>
                <input
                  className={inputClass}
                  value={freelancerName}
                  onChange={(e) => setFreelancerName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div>
                <label className={labelClass}>Start date</label>
                <input
                  className={inputClass}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>End date</label>
                <input
                  className={inputClass}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Project description</label>
              <textarea
                className={`${textareaClass} min-h-28`}
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe the scope, goals, and key deliverables..."
              />
            </div>

            <div className="mt-4">
              <label className={labelClass}>Payment terms</label>
              <input
                className={inputClass}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Deliverables</label>
                <button
                  type="button"
                  className={`${chipClass} px-3 py-2 text-xs font-medium transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                  onClick={() => setDeliverables((p) => [...p, ""])}
                >
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {deliverables.map((d, idx) => (
                  <input
                    key={`del-${idx}`}
                    className={inputClass}
                    placeholder={`Deliverable ${idx + 1}`}
                    value={d}
                    onChange={(e) =>
                      setDeliverables((prev) =>
                        prev.map((x, i) => (i === idx ? e.target.value : x))
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Additional clauses</label>
                <button
                  type="button"
                  className={`${chipClass} px-3 py-2 text-xs font-medium transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                  onClick={() => setCustomClauses((p) => [...p, ""])}
                >
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {customClauses.map((c, idx) => (
                  <textarea
                    key={`cl-${idx}`}
                    className={`${textareaClass} min-h-[72px]`}
                    placeholder={`Clause ${idx + 1}`}
                    value={c}
                    onChange={(e) =>
                      setCustomClauses((prev) =>
                        prev.map((x, i) => (i === idx ? e.target.value : x))
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Right: Preview + Results */}
          <section className={`${panelClass} relative p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tinyLabelClass}`}
                >
                  Generated contract
                </p>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  File name:{" "}
                  <span
                    className={`font-mono text-xs ${
                      isDarkTheme ? "text-white/80" : "text-slate-800"
                    }`}
                  >
                    {(toSafeFileName(jobTitle || "contract") || "contract") +
                      ".txt"}
                  </span>
                </p>
              </div>
            </div>

            <textarea
              className={`${textareaClass} mt-4 min-h-[280px] font-mono text-xs leading-relaxed`}
              value={contractText}
              readOnly
            />

            {/* AI Results */}
            <div className="mt-5 space-y-4">
              <FairnessScore score={fairnessScore} />
              <ClauseAnalysis
                clauses={clauseItems}
                isLoading={isEvaluating}
              />
            </div>

            {!rawResult && !isEvaluating && (
              <p className={`mt-4 text-sm ${mutedTextClass}`}>
                Run an evaluation to see clause-by-clause fairness and
                suggested rewrites.
              </p>
            )}

            {isEvaluating && (
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/10" />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
