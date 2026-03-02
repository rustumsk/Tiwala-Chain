import Link from "next/link";
import JobStatusBadge from "@/components/jobs/job-status-badge";
import type { EscrowJob } from "@/types";

type JobCardProps = {
  job: EscrowJob;
  counterpartyLabel: string;
  counterpartyAddress: string;
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

export default function JobCard({
  job,
  counterpartyLabel,
  counterpartyAddress,
}: JobCardProps) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-slate-100">Job #{job.id.toString()}</p>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <p>
          <span className="text-slate-400">{counterpartyLabel}: </span>
          {truncateAddress(counterpartyAddress)}
        </p>
        <p>
          <span className="text-slate-400">Escrow Amount: </span>
          {formatUsdt(job.amount)} USDT
        </p>
      </div>

      <div className="mt-4">
        <Link
          className="inline-flex h-9 items-center rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-200 transition hover:border-slate-500"
          href={`/jobs/${job.id.toString()}`}
        >
          View Job Details
        </Link>
      </div>
    </article>
  );
}
