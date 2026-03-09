"use client";

import { useAppTheme } from "@/components/layout/theme-context";

export type ClauseItem = {
  title: string;
  isFair: boolean;
  suggestion?: string;
};

type ClauseAnalysisProps = {
  clauses: ClauseItem[];
};

export default function ClauseAnalysis({ clauses }: ClauseAnalysisProps) {
  const { theme } = useAppTheme();
  const isDarkTheme = theme === "dark";

  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";

  if (clauses.length === 0) {
    return (
      <p className={`${subtlePanelClass} rounded-xl p-4 text-sm ${mutedTextClass}`}>
        No clause-level analysis available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {clauses.map((clause, idx) => (
        <article
          className={`${subtlePanelClass} rounded-xl p-4`}
          key={`${clause.title}-${idx}`}
        >
          <div className="flex items-center justify-between gap-4">
            <p className={`text-sm font-medium ${titleClass}`}>{clause.title}</p>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${
                clause.isFair
                  ? isDarkTheme
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isDarkTheme
                    ? "border-red-400/40 bg-red-500/10 text-red-200"
                    : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {clause.isFair ? "Fair" : "Unfair"}
            </span>
          </div>
          {clause.suggestion ? (
            <p className={`mt-2 text-sm ${mutedTextClass}`}>{clause.suggestion}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
