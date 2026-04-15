"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import FairnessScore from "@/components/ai/fairness-score";
import ClauseAnalysis from "@/components/ai/clause-analysis";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import type { ParsedClause } from "@/lib/ai-parsing";
import {
  evaluatePublicAiReview,
  type PublicAiEvaluationResponse,
} from "@/lib/public-services";

export default function PublicAiReviewPage() {
  const {
    panelClass,
    mutedTextClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
    inputClass,
  } = useThemeStyles();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PublicAiEvaluationResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedClauses: ParsedClause[] =
    result?.clauses.map((clause) => ({
      title: clause.clause,
      isFair: clause.label.toLowerCase() === "fair",
      confidence: clause.confidence,
      reason: clause.reason ?? undefined,
      suggestion: clause.suggestion ?? undefined,
      issue: clause.issue ?? undefined,
    })) ?? [];

  async function handleSubmit() {
    if (!file) {
      setError("Upload a PDF or DOCX contract first.");
      return;
    }

    setError("");
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await evaluatePublicAiReview(file);
      setResult(response);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "AI review failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`mx-auto min-h-screen w-full max-w-6xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
              Public AI review
            </span>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Review a contract with AI
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Anonymous visitors can upload one contract and receive a limited fairness report with the top flagged clauses and short explanations.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`${chipClass} rounded-full px-3 py-2`}>
              3 reviews per day
            </span>
            <span className={`${chipClass} rounded-full px-3 py-2`}>
              1 review at a time
            </span>
            <Link href="/" className={`${chipClass} rounded-full px-3 py-2 transition hover:border-violet-300 hover:bg-violet-500/10`}>
              Sign in for more
            </Link>
          </div>
        </div>
      </section>

      <section className={`${panelClass} mt-6 rounded-2xl p-6`}>
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
              Contract file
            </label>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={`${inputClass} h-auto py-3`}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className={`mt-2 text-xs ${mutedTextClass}`}>
              Anonymous uploads are limited to PDF or DOCX files up to 3 MB.
            </p>

            <button
              type="button"
              className={`${actionChipClass} mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`}
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Run AI review
                </>
              )}
            </button>

            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <div className={`${panelClass} rounded-2xl border-dashed p-5`}>
            <h2 className={`text-lg font-semibold ${titleClass}`}>Anonymous review limits</h2>
            <ul className={`mt-3 space-y-3 text-sm leading-6 ${mutedTextClass}`}>
              <li>Returns the overall fairness score and the top flagged clauses only.</li>
              <li>Detailed rewrite workflows and history remain part of the signed-in experience.</li>
              <li>Heavy uploads, unsupported formats, and repeated requests are blocked to control abuse.</li>
            </ul>
          </div>
        </div>
      </section>

      {result ? (
        <section className="mt-6 grid gap-5 lg:grid-cols-[0.42fr_0.58fr]">
          <div className={`${panelClass} rounded-2xl p-6`}>
            <FairnessScore score={result.fairnessScore} />
            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className={mutedTextClass}>Total clauses</span>
                <span className={titleClass}>{result.totalClauses}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={mutedTextClass}>Flagged clauses</span>
                <span className={titleClass}>{result.unfairCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={mutedTextClass}>Safe clauses</span>
                <span className={titleClass}>{result.fairCount}</span>
              </div>
            </div>
            {result.cached ? (
              <p className={`mt-4 text-xs ${mutedTextClass}`}>
                Served from cached analysis for this document hash.
              </p>
            ) : null}
            {result.truncated ? (
              <p className={`mt-2 text-xs ${mutedTextClass}`}>
                Showing a limited anonymous report. Sign in for deeper analysis.
              </p>
            ) : null}
          </div>

          <div className={`${panelClass} rounded-2xl p-6`}>
            <h2 className={`text-lg font-semibold ${titleClass}`}>Key clause findings</h2>
            <div className="mt-4">
              <ClauseAnalysis clauses={parsedClauses} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
