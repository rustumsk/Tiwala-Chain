"use client";

import { useAppTheme } from "@/components/layout/theme-context";

type FairnessScoreProps = {
  score: number | null;
};

export default function FairnessScore({ score }: FairnessScoreProps) {
  const { theme } = useAppTheme();
  const isDarkTheme = theme === "dark";

  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";

  if (score === null) {
    return (
      <p className={`${subtlePanelClass} rounded-xl p-4 text-sm ${mutedTextClass}`}>
        No fairness score returned yet.
      </p>
    );
  }

  const tone =
    score >= 75
      ? isDarkTheme
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : score >= 50
        ? isDarkTheme
          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : isDarkTheme
          ? "border-red-400/30 bg-red-500/10 text-red-200"
          : "border-red-200 bg-red-50 text-red-700";

  return (
    <p className={`rounded-xl border p-4 text-sm ${tone}`}>
      Fairness score: <span className="font-semibold">{score}/100</span>
    </p>
  );
}
