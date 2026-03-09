import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { JOB_STATUS_LABEL, type EscrowJobStatus } from "@/lib/contract";
import JobStatusBadge from "@/components/jobs/job-status-badge";
import type { EscrowJob } from "@/types";

type JobCardProps = {
  job: EscrowJob;
  counterpartyLabel: string;
  counterpartyAddress: string;
  mode?: "light" | "dark";
};

function truncateAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUsdt(amount: bigint) {
  const whole = Number(amount) / 1_000_000;
  if (whole >= 1_000) {
    return whole.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return whole.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function getStageIndex(status: EscrowJobStatus) {
  switch (status) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
    case 4:
      return 3;
    case 5:
    case 6:
      return 4;
    default:
      return 0;
  }
}

const STAGE_LABELS = ["Created", "Funded", "Work", "Review", "Release"];

const statusTone: Record<
  EscrowJobStatus,
  { gradient: string; fill: string; note: string; iconTone: string }
> = {
  0: {
    gradient: "from-slate-300/70 via-slate-300/15 to-transparent",
    fill: "bg-slate-300/60",
    note: "Waiting for funding to lock the job into escrow.",
    iconTone: "text-slate-200",
  },
  1: {
    gradient: "from-blue-300/80 via-blue-400/20 to-transparent",
    fill: "bg-blue-300/80",
    note: "Funds are secured and the job can move forward.",
    iconTone: "text-blue-200",
  },
  2: {
    gradient: "from-amber-300/80 via-amber-400/20 to-transparent",
    fill: "bg-amber-300/80",
    note: "Delivery is in motion and moving toward submission.",
    iconTone: "text-amber-200",
  },
  3: {
    gradient: "from-orange-300/80 via-orange-400/20 to-transparent",
    fill: "bg-orange-300/80",
    note: "Work is submitted and waiting for review or release.",
    iconTone: "text-orange-200",
  },
  4: {
    gradient: "from-red-300/80 via-red-400/20 to-transparent",
    fill: "bg-red-300/80",
    note: "A dispute is blocking settlement and needs attention.",
    iconTone: "text-red-200",
  },
  5: {
    gradient: "from-emerald-300/80 via-emerald-400/20 to-transparent",
    fill: "bg-emerald-300/80",
    note: "Payout has been released and the workflow is settled.",
    iconTone: "text-emerald-200",
  },
  6: {
    gradient: "from-purple-300/80 via-purple-400/20 to-transparent",
    fill: "bg-purple-300/80",
    note: "Funds were refunded and the job is closed.",
    iconTone: "text-purple-200",
  },
};

export default function JobCard({
  job,
  counterpartyLabel,
  counterpartyAddress,
  mode = "dark",
}: JobCardProps) {
  const tone = statusTone[job.status];
  const stageIndex = getStageIndex(job.status);
  const isDarkTheme = mode === "dark";
  const rowClass = isDarkTheme
    ? "border border-white/12 bg-black/25 hover:border-violet-300/35 hover:bg-violet-500/[0.06]"
    : "border border-[#e6e8f1] bg-white hover:border-violet-300 hover:bg-violet-50/40";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#72788c]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#121420]";
  const mutedTextClass = isDarkTheme ? "text-white/55" : "text-[#63697c]";
  const railOffClass = isDarkTheme ? "bg-white/[0.1]" : "bg-[#e2e5f1]";
  const ctaClass = isDarkTheme
    ? "border border-white/14 bg-white/[0.04] text-white/90 hover:border-violet-300/35 hover:bg-violet-500/15"
    : "border border-[#d8dced] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50";

  return (
    <article className={`${rowClass} px-4 py-4 transition-colors lg:px-5`}>
      <div className={`pointer-events-none mb-4 h-px w-full bg-gradient-to-r ${tone.gradient}`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(120px,0.75fr)_minmax(170px,1.1fr)_minmax(130px,0.8fr)_minmax(180px,1.15fr)_auto] lg:items-center">
        <div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Job</p>
          <p className={`mt-1 text-sm font-semibold ${titleClass}`}>#{job.id.toString()}</p>
        </div>

        <div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>{counterpartyLabel}</p>
          <p className={`mt-1 text-sm font-medium ${isDarkTheme ? "text-white/90" : "text-[#1f2433]"}`}>{truncateAddress(counterpartyAddress)}</p>
        </div>

        <div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Escrow</p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${titleClass}`}>{formatUsdt(job.amount)} USDT</p>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className={`text-xs ${mutedTextClass}`}>{JOB_STATUS_LABEL[job.status]}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {STAGE_LABELS.map((label, index) => (
              <div key={label} className="flex-1">
                <div className={`h-1 ${index <= stageIndex ? tone.fill : railOffClass}`} />
              </div>
            ))}
          </div>
          <p className={`mt-2 text-xs ${mutedTextClass}`}>{tone.note}</p>
        </div>

        <div className="flex lg:justify-end">
          <Link
            className={`${ctaClass} inline-flex h-10 items-center gap-2 px-3 text-sm font-medium transition`}
            href={`/jobs/${job.id.toString()}`}
          >
            Open
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
