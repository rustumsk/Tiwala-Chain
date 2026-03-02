export type ClauseItem = {
  title: string;
  isFair: boolean;
  suggestion?: string;
};

type ClauseAnalysisProps = {
  clauses: ClauseItem[];
};

export default function ClauseAnalysis({ clauses }: ClauseAnalysisProps) {
  if (clauses.length === 0) {
    return (
      <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">
        No clause-level analysis available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {clauses.map((clause, idx) => (
        <article
          className="rounded-lg border border-slate-700 bg-slate-900/70 p-4"
          key={`${clause.title}-${idx}`}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-100">{clause.title}</p>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${
                clause.isFair
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-red-400/40 bg-red-500/10 text-red-200"
              }`}
            >
              {clause.isFair ? "Fair" : "Unfair"}
            </span>
          </div>
          {clause.suggestion ? (
            <p className="mt-2 text-sm text-slate-300">{clause.suggestion}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
