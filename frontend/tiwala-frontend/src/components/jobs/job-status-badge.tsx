import { JOB_STATUS_LABEL, type EscrowJobStatus } from "@/lib/contract";

const darkClasses: Record<EscrowJobStatus, string> = {
  0: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  1: "border-blue-400/40 bg-blue-500/10 text-blue-300",
  2: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  3: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  4: "border-red-400/40 bg-red-500/10 text-red-300",
  5: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  6: "border-purple-400/40 bg-purple-500/10 text-purple-300",
};

const lightClasses: Record<EscrowJobStatus, string> = {
  0: "border-slate-300 bg-slate-100 text-slate-600",
  1: "border-blue-200 bg-blue-50 text-blue-700",
  2: "border-amber-300 bg-amber-50 text-amber-700",
  3: "border-orange-300 bg-orange-50 text-orange-700",
  4: "border-red-300 bg-red-50 text-red-700",
  5: "border-emerald-300 bg-emerald-50 text-emerald-700",
  6: "border-purple-300 bg-purple-50 text-purple-700",
};

type JobStatusBadgeProps = {
  status: EscrowJobStatus;
  mode?: "light" | "dark";
};

export default function JobStatusBadge({ status, mode = "dark" }: JobStatusBadgeProps) {
  const cls = mode === "dark" ? darkClasses[status] : lightClasses[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}
