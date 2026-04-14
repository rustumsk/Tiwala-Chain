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

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
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

const statusAccent: Record<EscrowJobStatus, string> = {
  0: "#94a3b8",
  1: "#60a5fa",
  2: "#fbbf24",
  3: "#fb923c",
  4: "#f87171",
  5: "#34d399",
  6: "#a78bfa",
};

export default function JobCard({
  job,
  counterpartyLabel,
  counterpartyAddress,
  mode = "dark",
}: JobCardProps) {
  const stageIndex = getStageIndex(job.status);
  const isDarkTheme = mode === "dark";

  const rowClass = isDarkTheme
    ? "border border-white/10 bg-white/[0.02] hover:border-violet-300/30 hover:bg-violet-500/[0.04]"
    : "border border-[#e6e8f1] bg-white hover:border-violet-300 hover:bg-violet-50/30";

  const tinyLabelClass = isDarkTheme ? "text-white/40" : "text-[#72788c]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#121420]";
  const mutedTextClass = isDarkTheme ? "text-white/55" : "text-[#63697c]";
  const railOffClass = isDarkTheme ? "bg-white/[0.08]" : "bg-[#e2e5f1]";
  const stageLabelClass = isDarkTheme ? "text-white/30" : "text-[#a0a6ba]";

  const ctaClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03] text-white/90 hover:border-violet-300/35 hover:bg-violet-500/15"
    : "border border-[#d8dced] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50";

  const displayTitle =
    job.title?.trim() || `Job #${job.id.toString()}`;
  const descriptionPreview = job.description?.trim()
    ? truncateText(job.description.trim(), 100)
    : null;

  const accent = statusAccent[job.status];

  return (
    <Link
      href={`/jobs/${job.id.toString()}`}
      className={`${rowClass} group block rounded-xl px-5 py-4 transition-all duration-200 lg:px-6`}
    >
      {/* Accent line */}
      <div
        className="mb-4 h-px w-full"
        style={{
          background: `linear-gradient(to right, ${accent}55, transparent 70%)`,
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.8fr)_minmax(110px,0.7fr)_minmax(170px,1.1fr)_auto] lg:items-center">
        {/* Job info */}
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${titleClass}`}>{displayTitle}</p>
          <p className={`mt-0.5 text-[11px] tabular-nums ${tinyLabelClass}`}>
            #{job.id.toString()}
          </p>
          {descriptionPreview ? (
            <p className={`mt-1.5 truncate text-xs leading-5 ${mutedTextClass}`}>
              {descriptionPreview}
            </p>
          ) : null}
        </div>

        {/* Counterparty */}
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>{counterpartyLabel}</p>
          <p className={`mt-1 truncate text-sm font-medium tabular-nums ${isDarkTheme ? "text-white/85" : "text-[#1f2433]"}`}>
            {truncateAddress(counterpartyAddress)}
          </p>
        </div>

        {/* Escrow amount */}
        <div>
          <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Escrow</p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${titleClass}`}>
            {formatUsdt(job.amount)}
            <span className={`ml-1 text-xs font-normal ${mutedTextClass}`}>USDT</span>
          </p>
        </div>

        {/* Status + rail */}
        <div>
          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} />
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            {STAGE_LABELS.map((label, index) => (
              <div key={label} className="flex-1" title={label}>
                <div
                  className={`h-1 rounded-full transition-colors ${
                    index <= stageIndex ? "" : railOffClass
                  }`}
                  style={index <= stageIndex ? { backgroundColor: accent } : undefined}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between">
            {STAGE_LABELS.map((label, index) => (
              <span
                key={label}
                className={`flex-1 text-center text-[8px] uppercase tracking-[0.06em] ${
                  index <= stageIndex ? mutedTextClass : stageLabelClass
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex lg:justify-end">
          <span
            className={`${ctaClass} inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition group-hover:border-violet-300/40`}
          >
            Open
            <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}
