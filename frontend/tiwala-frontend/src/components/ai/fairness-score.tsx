type FairnessScoreProps = {
  score: number | null;
};

export default function FairnessScore({ score }: FairnessScoreProps) {
  if (score === null) {
    return (
      <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">
        No fairness score returned yet.
      </p>
    );
  }

  const tone =
    score >= 75
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : score >= 50
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-red-400/30 bg-red-500/10 text-red-200";

  return (
    <p className={`rounded-lg border p-3 text-sm ${tone}`}>
      Fairness score: <span className="font-semibold">{score}/100</span>
    </p>
  );
}
