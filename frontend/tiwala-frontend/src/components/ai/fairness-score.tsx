"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
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
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";

  if (score === null) {
    return (
      <div className={`${subtlePanelClass} rounded-xl p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              isDarkTheme ? "bg-white/5" : "bg-slate-100"
            }`}
          >
            <ShieldCheck
              size={20}
              className={isDarkTheme ? "text-white/30" : "text-slate-400"}
            />
          </div>
          <div>
            <p className={`text-sm font-medium ${isDarkTheme ? "text-white/50" : "text-slate-500"}`}>
              Fairness Score
            </p>
            <p className={`text-xs ${mutedTextClass}`}>
              Run AI analysis to see your score
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getScoreColor = () => {
    if (score > 70) return isDarkTheme ? "text-emerald-400" : "text-emerald-600";
    if (score >= 50) return isDarkTheme ? "text-amber-400" : "text-amber-600";
    return isDarkTheme ? "text-red-400" : "text-red-600";
  };

  const getGradient = () => {
    if (score > 70) return "from-emerald-500 to-emerald-400";
    if (score >= 50) return "from-amber-500 to-amber-400";
    return "from-red-500 to-red-400";
  };

  const getLabel = () => {
    if (score > 70) return "Healthy";
    if (score >= 50) return "Needs Review";
    return "High Risk";
  };

  return (
    <div className={`${subtlePanelClass} rounded-xl p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>
            Fairness Score
          </p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold tabular-nums ${getScoreColor()}`}>
              {score}
            </span>
            <span className={`text-lg opacity-50 ${getScoreColor()}`}>/ 100</span>
          </div>
        </div>
        <div
          className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${getGradient()} shadow-lg`}
        >
          {score > 70 ? (
            <CheckCircle2 size={24} className="text-white" />
          ) : (
            <AlertTriangle size={24} className="text-white" />
          )}
        </div>
      </div>

      <div
        className={`mt-3 h-2 overflow-hidden rounded-full ${
          isDarkTheme ? "bg-white/10" : "bg-slate-200"
        }`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${getGradient()} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>

      <p
        className={`mt-2.5 text-xs font-medium ${
          score > 70
            ? isDarkTheme
              ? "text-emerald-300/80"
              : "text-emerald-700"
            : score >= 50
              ? isDarkTheme
                ? "text-amber-300/80"
                : "text-amber-700"
              : isDarkTheme
                ? "text-red-300/80"
                : "text-red-700"
        }`}
      >
        {getLabel()}
        {score <= 70 &&
          " — review flagged clauses below before proceeding."}
      </p>
    </div>
  );
}
