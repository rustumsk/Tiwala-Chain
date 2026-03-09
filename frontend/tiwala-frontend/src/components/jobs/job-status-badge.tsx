import { JOB_STATUS_LABEL, type EscrowJobStatus } from "@/lib/contract";

const statusClasses: Record<EscrowJobStatus, string> = {
  0: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  1: "border-blue-400/40 bg-blue-500/10 text-blue-200",
  2: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  3: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  4: "border-red-400/40 bg-red-500/10 text-red-200",
  5: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  6: "border-purple-400/40 bg-purple-500/10 text-purple-200",
};

type JobStatusBadgeProps = {
  status: EscrowJobStatus;
};

export default function JobStatusBadge({ status }: JobStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-medium tracking-[0.14em] uppercase ${statusClasses[status]}`}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}
