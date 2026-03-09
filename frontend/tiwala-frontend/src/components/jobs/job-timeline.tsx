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
  mode?: "light" | "dark";
};

export default function JobTimeline({ status, mode = "dark" }: JobTimelineProps) {
  const isDisputed = status === 4;
  const isRefunded = status === 6;
  const activeIndex = orderedStatuses.findIndex((step) => step.value === status);
  const isDarkTheme = mode === "dark";

  return (
    <div
      className={`border p-5 ${
        isDarkTheme
          ? "border-white/12 bg-black/28"
          : "border-[#e4e8f2] bg-white shadow-[0_10px_26px_rgba(40,50,90,0.06)]"
      }`}
    >
      <h3
        className={`text-sm font-semibold uppercase tracking-[0.15em] ${
          isDarkTheme ? "text-slate-300" : "text-[#6b7185]"
        }`}
      >
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
                    ? isDarkTheme
                      ? "border-violet-300/60 bg-violet-500/15 text-violet-200"
                      : "border-violet-300 bg-violet-100 text-violet-700"
                    : isDarkTheme
                      ? "border-slate-700 bg-slate-900 text-slate-500"
                      : "border-[#d4d9e8] bg-[#f5f7fc] text-[#8a91a6]"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={
                  done
                    ? isDarkTheme
                      ? "text-slate-100"
                      : "text-[#1b2130]"
                    : isDarkTheme
                      ? "text-slate-400"
                      : "text-[#697086]"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {isDisputed ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          Current state: Disputed
        </p>
      ) : null}
      {isRefunded ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-purple-400/30 bg-purple-500/10 text-purple-200"
              : "border-purple-200 bg-purple-50 text-purple-700"
          }`}
        >
          Current state: Refunded
        </p>
      ) : null}
    </div>
  );
}
