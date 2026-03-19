"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Sparkles } from "lucide-react";

type ClauseResult = {
  clause: string;
  label: "fair" | "unfair" | string;
  confidence: number;
  suggestion: string;
  issue?: string;
  suggested_rewrite?: string;
  suggestion_source?: string;
};

type EvaluationResponse = {
  total_clauses: number;
  unfair_count: number;
  fair_count: number;
  fairness_score: number;
  clauses: ClauseResult[];
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
  "http://localhost:5067";

function toSafeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function PublicContractsPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalAmountUsdt, setTotalAmountUsdt] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% upfront, 50% on completion");
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [customClauses, setCustomClauses] = useState<string[]>([""]);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvaluationResponse | null>(null);

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

  const fairnessLabel = useMemo(() => {
    if (!result) return null;
    const score = Math.round((result.fairness_score ?? 0) * 100);
    if (score >= 80) return { label: "Healthy", tone: "text-emerald-300 bg-emerald-500/10 border-emerald-400/25" };
    if (score >= 60) return { label: "Needs review", tone: "text-amber-200 bg-amber-500/10 border-amber-400/25" };
    return { label: "High risk", tone: "text-red-200 bg-red-500/10 border-red-400/25" };
  }, [result]);

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  async function evaluate() {
    setError("");
    setIsEvaluating(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/contracts/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: contractText }),
      });
      const payload = (await res.json().catch(() => null)) as EvaluationResponse | { error?: string } | null;
      if (!res.ok) {
        throw new Error((payload as any)?.error ?? `Request failed (${res.status}).`);
      }
      setResult(payload as EvaluationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setIsEvaluating(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50";
  const textareaClass =
    "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50";
  const labelClass = "mb-2 block text-xs font-medium text-white/70";
  const panelClass = "rounded-2xl border border-white/12 bg-black/32";
  const chipClass = "rounded-xl border border-white/14 bg-white/[0.04] text-white/82";

  return (
    <div className="themed-app-page min-h-screen bg-[#060912] px-4 py-8 text-white md:px-8">
      <section className="mx-auto w-full max-w-6xl space-y-5">
        <header className={`${panelClass} px-6 py-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
                <Sparkles size={12} />
                Public Contract Studio
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Create a contract, then check fairness</h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60">
                This page is public and does not require wallet sign-in. Requests are rate-limited.
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
                className="inline-flex items-center gap-2 rounded-xl border border-violet-300/40 bg-violet-500/18 px-5 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-300/60 hover:bg-violet-500/22 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void evaluate()}
                disabled={isEvaluating}
              >
                {isEvaluating ? "Evaluating..." : "Evaluate fairness"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          ) : null}
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={`${panelClass} p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Contract fields</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Job title</label>
                <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Total amount (USDT)</label>
                <input
                  className={inputClass}
                  value={totalAmountUsdt}
                  onChange={(e) => setTotalAmountUsdt(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className={labelClass}>Employer</label>
                <input className={inputClass} value={employerName} onChange={(e) => setEmployerName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Freelancer</label>
                <input className={inputClass} value={freelancerName} onChange={(e) => setFreelancerName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Start date</label>
                <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>End date</label>
                <input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Project description</label>
              <textarea className={`${textareaClass} min-h-28`} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
            </div>

            <div className="mt-4">
              <label className={labelClass}>Payment terms</label>
              <input className={inputClass} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Deliverables</label>
                <button
                  type="button"
                  className={`${chipClass} px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
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
                      setDeliverables((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))
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
                  className={`${chipClass} px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
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
                      setCustomClauses((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))
                    }
                  />
                ))}
              </div>
            </div>
          </section>

          <section className={`${panelClass} relative p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Generated contract</p>
                <p className="mt-2 text-sm text-white/60">
                  File name:{" "}
                  <span className="font-mono text-xs text-white/80">
                    {(toSafeFileName(jobTitle || "contract") || "contract") + ".txt"}
                  </span>
                </p>
              </div>
              {result && fairnessLabel ? (
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${fairnessLabel.tone}`}>
                  {fairnessLabel.label}
                  <span className="text-white/70">
                    {Math.round((result.fairness_score ?? 0) * 100)}%
                  </span>
                </span>
              ) : null}
            </div>

            <textarea className={`${textareaClass} mt-4 min-h-[320px] font-mono text-xs leading-relaxed`} value={contractText} readOnly />

            {isEvaluating ? (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <span className="inline-flex size-4 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                  Evaluating clauses for fairness…
                </div>
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-20 rounded-full bg-white/10" />
                        <div className="h-3 w-24 rounded-full bg-white/10" />
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="h-2 w-full rounded-full bg-white/8" />
                        <div className="h-2 w-5/6 rounded-full bg-white/6" />
                        <div className="h-2 w-2/3 rounded-full bg-white/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : result ? (
              <div className="mt-5 space-y-3">
                <div className={`${chipClass} flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm`}>
                  <span>
                    Clauses: <span className="font-semibold">{result.total_clauses}</span>
                  </span>
                  <span>
                    Unfair: <span className="font-semibold text-red-200">{result.unfair_count}</span>
                    <span className="mx-2 text-white/20">/</span>
                    Fair: <span className="font-semibold text-emerald-200">{result.fair_count}</span>
                  </span>
                </div>

                <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                  {result.clauses.map((c, idx) => {
                    const isUnfair = c.label === "unfair";
                    return (
                      <article
                        key={`${idx}-${c.label}-${c.confidence}`}
                        className={`rounded-2xl border p-4 ${
                          isUnfair
                            ? "border-red-400/25 bg-red-500/10"
                            : "border-emerald-400/20 bg-emerald-500/8"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                            Clause {idx + 1}
                          </p>
                          <span className="inline-flex items-center gap-2 text-xs text-white/70">
                            {isUnfair ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-red-100">
                                <AlertTriangle size={12} /> Unfair
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">
                                <CheckCircle2 size={12} /> Fair
                              </span>
                            )}
                            <span className="font-mono">{Math.round((c.confidence ?? 0) * 100)}%</span>
                            {c.suggestion_source ? (
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-white/60">
                                {c.suggestion_source}
                              </span>
                            ) : null}
                          </span>
                        </div>

                        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/80">{c.clause}</p>

                        {c.issue ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Issue</p>
                            <p className="mt-1 text-sm text-white/75">{c.issue}</p>
                          </div>
                        ) : null}

                        {c.suggested_rewrite ? (
                          <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                                Suggested rewrite
                              </p>
                              <button
                                type="button"
                                onClick={() => void copyText(c.suggested_rewrite ?? "")}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/70 transition hover:border-violet-300/40 hover:bg-violet-500/10"
                              >
                                <Copy size={12} />
                                Copy
                              </button>
                            </div>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-white/85">
                              {c.suggested_rewrite}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Suggestion</p>
                            <p className="mt-1 text-sm text-white/75">{c.suggestion}</p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-white/50">
                Run an evaluation to see clause-by-clause fairness and suggested rewrites.
              </p>
            )}

            {isEvaluating ? (
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/30" />
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

