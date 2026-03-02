import type { EscrowJobStatus } from "@/lib/contract";

const orderedStatuses: Array<{
  value: EscrowJobStatus;
  label: string;
}> = [
  { value: 0, label: "Created" },
  { value: 1, label: "Funded" },
  { value: 2, label: "In Progress" },
  { value: 3, label: "Submitted" },
  { value: 5, label: "Completed" },
];

type JobTimelineProps = {
  status: EscrowJobStatus;
};

export default function JobTimeline({ status }: JobTimelineProps) {
  const isDisputed = status === 4;
  const isRefunded = status === 6;
  const activeIndex = orderedStatuses.findIndex((step) => step.value === status);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-300">
        Status Timeline
      </h3>
      <ol className="mt-4 space-y-3">
        {orderedStatuses.map((step, index) => {
          const done = activeIndex >= index;
          return (
            <li className="flex items-center gap-3" key={step.value}>
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full border text-xs ${
                  done
                    ? "border-teal-300/60 bg-teal-400/15 text-teal-200"
                    : "border-slate-700 bg-slate-900 text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              <span className={done ? "text-slate-100" : "text-slate-400"}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {isDisputed ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          Current state: Disputed
        </p>
      ) : null}
      {isRefunded ? (
        <p className="mt-4 rounded-lg border border-purple-400/30 bg-purple-500/10 p-3 text-sm text-purple-200">
          Current state: Refunded
        </p>
      ) : null}
    </div>
  );
}
