"use client";

import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import type { ParsedClause } from "@/lib/ai-parsing";

type ClauseAnalysisProps = {
  clauses: ParsedClause[];
  isLoading?: boolean;
};

function SkeletonCard({ isDarkTheme }: { isDarkTheme: boolean }) {
  return (
    <div
      className={`animate-pulse rounded-xl border p-4 ${
        isDarkTheme
          ? "border-white/10 bg-white/[0.02]"
          : "border-slate-200 bg-slate-50/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`h-3 w-24 rounded-full ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`}
        />
        <div
          className={`h-5 w-16 rounded-full ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`}
        />
      </div>
      <div className="mt-3 space-y-2">
        <div
          className={`h-2.5 w-full rounded-full ${isDarkTheme ? "bg-white/8" : "bg-slate-200/80"}`}
        />
        <div
          className={`h-2.5 w-5/6 rounded-full ${isDarkTheme ? "bg-white/6" : "bg-slate-200/60"}`}
        />
        <div
          className={`h-2.5 w-2/3 rounded-full ${isDarkTheme ? "bg-white/4" : "bg-slate-200/40"}`}
        />
      </div>
    </div>
  );
}

export default function ClauseAnalysis({
  clauses,
  isLoading,
}: ClauseAnalysisProps) {
  const { theme } = useAppTheme();
  const isDarkTheme = theme === "dark";

  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} isDarkTheme={isDarkTheme} />
        ))}
      </div>
    );
  }

  if (clauses.length === 0) {
    return (
      <div
        className={`rounded-xl border p-4 text-center ${
          isDarkTheme
            ? "border-white/10 bg-white/[0.02]"
            : "border-[#eaecf4] bg-[#fafbff]"
        }`}
      >
        <p className={`text-sm ${mutedTextClass}`}>
          No clause-level analysis available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clauses.map((clause, idx) => {
        const borderColor = clause.isFair
          ? isDarkTheme
            ? "border-emerald-400/20 bg-emerald-500/5"
            : "border-emerald-200 bg-emerald-50/50"
          : isDarkTheme
            ? "border-red-400/20 bg-red-500/5"
            : "border-red-200 bg-red-50/50";

        return (
          <article
            className={`rounded-xl border p-4 transition-all ${borderColor}`}
            key={`${clause.title.slice(0, 30)}-${idx}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${
                    isDarkTheme ? "bg-white/10 text-white/70" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {idx + 1}
                </span>
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}
                >
                  Clause {idx + 1}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    clause.isFair
                      ? isDarkTheme
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                        : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                      : isDarkTheme
                        ? "bg-red-500/15 text-red-300 ring-1 ring-red-400/30"
                        : "bg-red-100 text-red-700 ring-1 ring-red-300"
                  }`}
                >
                  {clause.isFair ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}
                  {clause.isFair ? "Fair" : "Needs Review"}
                </span>
                {clause.suggestionSource && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isDarkTheme
                        ? "bg-white/[0.06] text-white/50 ring-1 ring-white/10"
                        : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    }`}
                  >
                    {clause.suggestionSource}
                  </span>
                )}
              </div>
            </div>

            <p
              className={`mt-2.5 whitespace-pre-line text-sm leading-relaxed ${titleClass}`}
            >
              {clause.title}
            </p>

            {!clause.isFair && clause.reason && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 ${
                  isDarkTheme
                    ? "bg-amber-400/10 ring-1 ring-amber-400/20"
                    : "bg-amber-50 ring-1 ring-amber-200"
                }`}
              >
                <Info
                  size={13}
                  className={`mt-0.5 shrink-0 ${isDarkTheme ? "text-amber-300" : "text-amber-600"}`}
                />
                <p
                  className={`text-xs leading-snug ${
                    isDarkTheme ? "text-amber-200/90" : "text-amber-800"
                  }`}
                >
                  {clause.reason}
                </p>
              </div>
            )}

            {clause.issue && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 ${
                  isDarkTheme
                    ? "border-white/10 bg-black/20"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider ${tinyLabelClass}`}
                >
                  Issue
                </p>
                <p className={`mt-1 text-sm ${mutedTextClass}`}>
                  {clause.issue}
                </p>
              </div>
            )}

            {clause.suggestedRewrite ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2.5 ${
                  isDarkTheme
                    ? "border-violet-400/20 bg-violet-500/8"
                    : "border-violet-200 bg-violet-50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-violet-500" />
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider ${tinyLabelClass}`}
                  >
                    Suggested Rewrite
                  </p>
                </div>
                <p
                  className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed ${
                    isDarkTheme ? "text-violet-200/90" : "text-violet-900"
                  }`}
                >
                  {clause.suggestedRewrite}
                </p>
              </div>
            ) : clause.suggestion && !clause.isFair ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2.5 ${
                  isDarkTheme
                    ? "border-violet-400/20 bg-violet-500/8"
                    : "border-violet-200 bg-violet-50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-violet-500" />
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider ${tinyLabelClass}`}
                  >
                    Suggestion
                  </p>
                </div>
                <p
                  className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed ${
                    isDarkTheme ? "text-violet-200/90" : "text-violet-900"
                  }`}
                >
                  {clause.suggestion}
                </p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
