"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Clock, DollarSign, Download, ExternalLink, Paperclip, XCircle } from "lucide-react";
import { useAccount } from "wagmi";
import { useLocalUserProfile } from "@/hooks/use-local-user-profile";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { getStoredAuthSession } from "@/lib/auth";
import { PROPOSAL_STATUS_LABELS } from "@/lib/marketplace-constants";
import { notifyError } from "@/lib/notify";
import { downloadProposalCv, fetchMyProposals, type ProposalResponse } from "@/lib/proposals";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

type StatusGroup = "active" | "reviewing" | "closed";

function getStatusGroup(status: string): StatusGroup {
  if (status === "Submitted" || status === "Viewed") return "active";
  if (status === "Shortlisted" || status === "Selected") return "reviewing";
  return "closed";
}

function statusBadge(status: string, isDark: boolean) {
  switch (status) {
    case "Submitted":
      return isDark
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-amber-300 bg-amber-50 text-amber-700";
    case "Viewed":
      return isDark
        ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
        : "border-sky-300 bg-sky-50 text-sky-700";
    case "Shortlisted":
      return isDark
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
        : "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "Selected":
      return isDark
        ? "border-violet-400/30 bg-violet-400/10 text-violet-300"
        : "border-violet-300 bg-violet-50 text-violet-700";
    case "ConvertedToOffer":
      return isDark
        ? "border-violet-400/30 bg-violet-500/15 text-violet-200"
        : "border-violet-300 bg-violet-100 text-violet-800";
    case "Rejected":
      return isDark
        ? "border-red-400/30 bg-red-500/10 text-red-300"
        : "border-red-300 bg-red-50 text-red-700";
    case "Withdrawn":
      return isDark
        ? "border-white/10 bg-white/[0.03] text-white/40"
        : "border-slate-200 bg-slate-50 text-slate-400";
    default:
      return isDark
        ? "border-white/10 bg-white/[0.03] text-white/60"
        : "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "Shortlisted" || status === "Selected")
    return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
  if (status === "Rejected" || status === "Withdrawn")
    return <XCircle size={14} className="text-slate-400 shrink-0" />;
  if (status === "ConvertedToOffer")
    return <CheckCircle2 size={14} className="text-violet-500 shrink-0" />;
  return <Clock size={14} className="text-amber-400 shrink-0" />;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function ProposalCard({
  proposal,
  border,
  subtle,
  titleClass,
  mutedTextClass,
  tinyLabelClass,
  isDarkTheme,
  onDownloadCv,
}: {
  proposal: ProposalResponse;
  border: string;
  subtle: string;
  titleClass: string;
  mutedTextClass: string;
  tinyLabelClass: string;
  isDarkTheme: boolean;
  onDownloadCv?: () => void;
}) {
  const badge = statusBadge(proposal.status, isDarkTheme);
  const isActive = proposal.postingStatus === "Published";

  return (
    <div className={`rounded-2xl border p-5 transition ${border} ${isDarkTheme ? "bg-black/20 hover:border-white/15" : "bg-white hover:border-violet-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon status={proposal.status} />
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge}`}>
              {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
            </span>
            {proposal.convertedJobId && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isDarkTheme ? "border-violet-400/30 bg-violet-500/15 text-violet-300" : "border-violet-300 bg-violet-100 text-violet-700"}`}>
                Offer #{proposal.convertedJobId}
              </span>
            )}
          </div>

          <Link
            href={`/postings/${proposal.postingId}`}
            className={`group mt-1 block text-base font-semibold leading-snug transition hover:text-violet-500 ${titleClass}`}
          >
            {proposal.postingTitle}
            <ArrowRight size={13} className="ml-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>

          <p className={`mt-0.5 text-xs ${mutedTextClass}`}>
            {proposal.employerDisplayName
              ? `Employer: ${proposal.employerDisplayName}`
              : `${proposal.employerWallet.slice(0, 6)}…${proposal.employerWallet.slice(-4)}`}
            <span className="mx-1.5 opacity-40">·</span>
            Applied {timeAgo(proposal.createdAt)}
            {!isActive && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className={isDarkTheme ? "text-slate-500" : "text-slate-400"}>Posting closed</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-3 ${border} ${subtle}`}>
        <div>
          <p className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
            <DollarSign size={10} /> Proposed
          </p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${titleClass}`}>
            ${proposal.proposedAmount.toLocaleString()} USDT
          </p>
        </div>

        {proposal.estimatedTimeline && (
          <div>
            <p className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
              <Clock size={10} /> Timeline
            </p>
            <p className={`mt-1 text-sm ${titleClass}`}>{proposal.estimatedTimeline}</p>
          </div>
        )}

        {proposal.updatedAt && proposal.updatedAt !== proposal.createdAt && (
          <div>
            <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Last update</p>
            <p className={`mt-1 text-sm ${titleClass}`}>{timeAgo(proposal.updatedAt)}</p>
          </div>
        )}
      </div>

      {proposal.coverLetter && (
        <p className={`mt-3 line-clamp-2 text-sm leading-relaxed ${mutedTextClass}`}>
          "{proposal.coverLetter}"
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/postings/${proposal.postingId}`}
          className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${isDarkTheme ? "border-white/10 bg-white/[0.04] text-white/70 hover:border-violet-400/30 hover:text-violet-300" : "border-[#e5e8f2] bg-white text-[#4a506a] hover:border-violet-300 hover:text-violet-700"}`}
        >
          <ExternalLink size={11} />
          View posting
        </Link>
        {proposal.convertedJobId && (
          <Link
            href="/offers"
            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${isDarkTheme ? "border-violet-400/30 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25" : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
          >
            View offer
          </Link>
        )}
        {proposal.hasCvAttachment && onDownloadCv && (
          <button
            type="button"
            onClick={onDownloadCv}
            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${isDarkTheme ? "border-white/10 bg-white/[0.04] text-white/70 hover:border-violet-400/30 hover:text-violet-300" : "border-[#e5e8f2] bg-white text-[#4a506a] hover:border-violet-300 hover:text-violet-700"}`}
          >
            <Paperclip size={11} />
            My CV
            <Download size={10} className="opacity-60" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ApplicationsPage() {
  const { address, isConnected } = useAccount();
  const { pageClass, mutedTextClass, tinyLabelClass, titleClass, chipClass, actionChipClass, isDarkTheme } = useThemeStyles();
  const profile = useLocalUserProfile(address);

  const session = useMemo(() => {
    if (!address) return null;
    const s = getStoredAuthSession();
    if (!s) return null;
    return s.walletAddress.toLowerCase() === address.toLowerCase() ? s : null;
  }, [address]);

  const [applications, setApplications] = useState<ProposalResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | StatusGroup>("all");

  const loadApplications = useCallback(
    async (silent = false) => {
      if (!session) return;
      if (!silent) { setIsLoading(true); setError(""); }
      try {
        setApplications(await fetchMyProposals(session));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load applications.";
        setError(message);
        if (!silent) notifyError(message);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [session]
  );

  useEffect(() => { void loadApplications(false); }, [loadApplications]);
  useVisibleInterval(() => void loadApplications(true), API_POLL_INTERVAL_MS, Boolean(session));

  const border = isDarkTheme ? "border-white/[0.07]" : "border-[#e5e8f2]";
  const subtle = isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]";

  const filtered = filter === "all" ? applications : applications.filter((p) => getStatusGroup(p.status) === filter);

  const counts = {
    all: applications.length,
    active: applications.filter((p) => getStatusGroup(p.status) === "active").length,
    reviewing: applications.filter((p) => getStatusGroup(p.status) === "reviewing").length,
    closed: applications.filter((p) => getStatusGroup(p.status) === "closed").length,
  };

  // Guard: employer only
  if (isConnected && profile?.role === "employer") {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-[700px]">
          <div className={`rounded-2xl border p-8 text-center ${border} ${subtle}`}>
            <Briefcase className={`mx-auto h-8 w-8 ${mutedTextClass}`} />
            <p className={`mt-3 text-base font-semibold ${titleClass}`}>This page is for freelancers</p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>Switch to a freelancer or both role to track your applications.</p>
            <Link href="/settings/profile" className={`mt-5 inline-flex h-9 items-center rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
              Profile settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="mx-auto w-full max-w-[900px] space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${titleClass}`}>My applications</h1>
            <p className={`mt-0.5 text-sm ${mutedTextClass}`}>
              Track your proposals and monitor responses from employers.
            </p>
          </div>
          <Link href="/postings" className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
            Browse more jobs
          </Link>
        </div>

        {/* Summary cards */}
        {!isLoading && applications.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { key: "all", label: "Total", value: counts.all, color: "" },
              { key: "active", label: "Pending", value: counts.active, color: "text-amber-500" },
              { key: "reviewing", label: "Shortlisted", value: counts.reviewing, color: "text-emerald-500" },
              { key: "closed", label: "Closed", value: counts.closed, color: isDarkTheme ? "text-white/40" : "text-slate-400" },
            ].map((stat) => (
              <button
                key={stat.key}
                type="button"
                onClick={() => setFilter(stat.key as typeof filter)}
                className={`rounded-2xl border p-4 text-left transition ${border} ${filter === stat.key ? (isDarkTheme ? "border-violet-400/40 bg-violet-500/10" : "border-violet-300 bg-violet-50") : (isDarkTheme ? "bg-black/20 hover:border-white/15" : "bg-white hover:border-violet-200")}`}
              >
                <p className={`text-2xl font-bold tabular-nums ${stat.color || titleClass}`}>{stat.value}</p>
                <p className={`mt-0.5 text-xs ${mutedTextClass}`}>{stat.label}</p>
              </button>
            ))}
          </div>
        )}

        {/* Filter chips */}
        {!isLoading && applications.length > 0 && (
          <div className={`flex items-center gap-2 border-b pb-4 ${border}`}>
            <p className={`text-xs ${mutedTextClass} mr-1`}>Filter:</p>
            {(["all", "active", "reviewing", "closed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition capitalize ${filter === f ? actionChipClass : chipClass}`}
              >
                {f === "all" ? "All" : f === "active" ? "Pending" : f === "reviewing" ? "Shortlisted" : "Closed"}
                <span className={`ml-1.5 tabular-nums ${filter === f ? "" : mutedTextClass}`}>
                  {counts[f]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
            {error}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-36 animate-pulse rounded-2xl border ${border} ${subtle}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center rounded-2xl border py-16 text-center ${border} ${subtle}`}>
            <Briefcase className={`h-8 w-8 ${mutedTextClass}`} />
            <p className={`mt-3 text-base font-semibold ${titleClass}`}>
              {filter === "all" ? "No applications yet" : `No ${filter === "active" ? "pending" : filter === "reviewing" ? "shortlisted" : "closed"} applications`}
            </p>
            <p className={`mt-1 max-w-xs text-sm ${mutedTextClass}`}>
              {filter === "all"
                ? "Browse open postings and submit your first proposal."
                : "Try switching to a different filter."}
            </p>
            {filter === "all" ? (
              <Link href="/postings" className={`mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
                Browse postings
              </Link>
            ) : (
              <button type="button" onClick={() => setFilter("all")} className={`mt-4 text-sm ${mutedTextClass} hover:underline`}>
                Show all applications
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                border={border}
                subtle={subtle}
                titleClass={titleClass}
                mutedTextClass={mutedTextClass}
                tinyLabelClass={tinyLabelClass}
                isDarkTheme={isDarkTheme}
                onDownloadCv={
                  proposal.hasCvAttachment && session
                    ? () => void downloadProposalCv(session, proposal.id).catch((e) => notifyError(e instanceof Error ? e.message : "Unable to download CV."))
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
