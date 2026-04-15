"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Briefcase, Calendar, CheckCircle2, Clock, DollarSign, Download, Edit3, FileText, Globe, Paperclip, Tag, Upload, Users, X } from "lucide-react";
import { useAccount } from "wagmi";
import { useLocalUserProfile } from "@/hooks/use-local-user-profile";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import ProposalThread from "@/components/marketplace/proposal-thread";
import { getStoredAuthSession } from "@/lib/auth";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_EXPERIENCE_LEVELS,
  MARKETPLACE_JOB_TYPES,
  POSTING_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
} from "@/lib/marketplace-constants";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  closePosting,
  downloadPostingBriefBlob,
  fetchPostingById,
  publishPosting,
  reopenPosting,
  type PostingResponse,
} from "@/lib/postings";
import {
  createProposal,
  downloadProposalCv,
  fetchPostingProposals,
  uploadProposalCv,
  withdrawProposal,
  type ProposalResponse,
} from "@/lib/proposals";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

function formatBudget(posting: PostingResponse) {
  if (posting.budgetType === "range" && posting.budgetMin && posting.budgetMax) {
    return `$${posting.budgetMin.toLocaleString()} – $${posting.budgetMax.toLocaleString()} USDT`;
  }
  return posting.budgetMin ? `$${posting.budgetMin.toLocaleString()} USDT` : "Budget on request";
}

function formatDeadline(d: string | null) {
  if (!d) return "Open";
  const date = new Date(d);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return "Deadline passed";
  if (daysLeft === 0) return "Closes today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

function statusConfig(status: string) {
  if (status === "Published") return { color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Open" };
  if (status === "Closed") return { color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20", label: "Closed" };
  if (status === "Filled") return { color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", label: "Filled" };
  if (status === "Draft") return { color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", label: "Draft" };
  return { color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20", label: POSTING_STATUS_LABELS[status] ?? status };
}

function proposalStatusConfig(status: string) {
  if (status === "Shortlisted") return { color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (status === "Rejected") return { color: "text-red-400", bg: "bg-red-500/10 border-red-400/20" };
  if (status === "Selected" || status === "ConvertedToOffer") return { color: "text-violet-400", bg: "bg-violet-500/10 border-violet-400/20" };
  if (status === "Withdrawn") return { color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20" };
  return { color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" };
}

export default function PostingDetailPage() {
  const params = useParams<{ id: string }>();
  const postingId = Number(params.id);
  const { address } = useAccount();
  const profile = useLocalUserProfile(address);
  const { pageClass, panelClass, mutedTextClass, tinyLabelClass, titleClass, inputClass, textareaClass, chipClass, actionChipClass, isDarkTheme } = useThemeStyles();

  const [posting, setPosting] = useState<PostingResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  // Proposal form
  const [coverLetter, setCoverLetter] = useState("");
  const [proposedAmount, setProposedAmount] = useState("");
  const [estimatedTimeline, setEstimatedTimeline] = useState("");
  const [portfolioLinks, setPortfolioLinks] = useState("");
  const [relevantExperience, setRelevantExperience] = useState("");
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({});
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const cvInputRef = useRef<HTMLInputElement>(null);

  const applyPanelRef = useRef<HTMLDivElement>(null);

  const session = useMemo(() => {
    if (!address) return null;
    const s = getStoredAuthSession();
    if (!s) return null;
    return s.walletAddress.toLowerCase() === address.toLowerCase() ? s : null;
  }, [address]);

  const loadPage = useCallback(
    async (silent = false) => {
      if (!Number.isFinite(postingId) || postingId <= 0) return;
      if (!silent) { setIsLoading(true); setError(""); }
      try {
        const nextPosting = await fetchPostingById(postingId);
        setPosting(nextPosting);
        if (session) {
          const nextProposals = await fetchPostingProposals(session, postingId);
          setProposals(nextProposals);
        } else {
          setProposals([]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load posting.";
        setError(msg);
        if (!silent) notifyError(msg);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [postingId, session]
  );

  useEffect(() => { void loadPage(false); }, [loadPage]);
  useVisibleInterval(() => void loadPage(true), API_POLL_INTERVAL_MS, Number.isFinite(postingId) && postingId > 0);

  const isOwner = Boolean(posting && address && posting.employerWallet.toLowerCase() === address.toLowerCase());
  const isFreelancer = profile?.role === "freelancer" || profile?.role === "both";
  const myProposal = !isOwner ? proposals[0] ?? null : null;
  const canApply = !isOwner && isFreelancer && !myProposal && posting?.status === "Published";

  const handlePostingAction = async (action: "publish" | "close" | "reopen") => {
    if (!session || !posting) return;
    setIsWorking(true);
    try {
      const next = action === "publish"
        ? await publishPosting(session, posting.id)
        : action === "close"
          ? await closePosting(session, posting.id)
          : await reopenPosting(session, posting.id);
      setPosting(next);
      notifySuccess(action === "publish" ? "Posting published." : action === "close" ? "Posting closed." : "Posting reopened.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to update posting.";
      setError(msg);
      notifyError(msg);
    } finally {
      setIsWorking(false);
    }
  };

  const handleApply = async () => {
    setFormError("");
    if (!session || !posting) { setFormError("You must be signed in to apply."); return; }
    if (!proposedAmount || Number(proposedAmount) <= 0) { setFormError("Enter a valid proposed amount."); return; }
    if (!coverLetter.trim()) { setFormError("A cover letter is required."); return; }
    setIsWorking(true);
    try {
      let cvAttachmentKey: string | undefined;
      if (cvFile) {
        setCvUploading(true);
        try {
          const result = await uploadProposalCv(session, cvFile);
          cvAttachmentKey = result.key;
        } finally {
          setCvUploading(false);
        }
      }
      const proposal = await createProposal(session, posting.id, {
        coverLetter,
        proposedAmount: Number(proposedAmount),
        estimatedTimeline,
        portfolioLinks: portfolioLinks.split(",").map((l) => l.trim()).filter(Boolean),
        relevantExperience,
        screeningAnswers,
        cvAttachmentKey,
      });
      setProposals([proposal]);
      notifySuccess("Proposal submitted successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit proposal.";
      setFormError(msg);
      notifyError(msg);
    } finally {
      setIsWorking(false);
    }
  };

  const handleWithdraw = async () => {
    if (!session || !myProposal) return;
    setIsWorking(true);
    try {
      const updated = await withdrawProposal(session, myProposal.id);
      setProposals([updated]);
      notifySuccess("Proposal withdrawn.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Unable to withdraw.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDownloadBrief = async () => {
    if (!session || !posting) return;
    try {
      const blob = await downloadPostingBriefBlob(session, posting.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Unable to download brief.");
    }
  };

  const border = isDarkTheme ? "border-white/[0.07]" : "border-[#e5e8f2]";
  const subtle = isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]";

  if (isLoading) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-[1100px] space-y-4">
          <div className={`h-8 w-48 animate-pulse rounded-xl ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`} />
          <div className={`h-64 animate-pulse rounded-2xl ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`} />
        </div>
      </div>
    );
  }

  if (!posting) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-[1100px]">
          <div className={`rounded-2xl border px-6 py-10 text-center ${border} ${subtle}`}>
            <p className={`text-base font-semibold ${titleClass}`}>Posting not found</p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>{error || "This posting may have been removed."}</p>
            <Link href="/postings" className={`mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${chipClass}`}>
              <ArrowLeft size={14} />
              Back to postings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sc = statusConfig(posting.status);

  return (
    <div className={pageClass}>
      <div className="mx-auto w-full max-w-[1100px]">

        {/* Back link */}
        <Link href="/postings" className={`mb-5 inline-flex items-center gap-1.5 text-sm ${mutedTextClass} hover:text-violet-500 transition-colors`}>
          <ArrowLeft size={14} />
          Back to postings
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">

          {/* ── Left column: job details ── */}
          <div className="min-w-0 space-y-5">
            <div className={`rounded-2xl border p-6 lg:p-7 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sc.bg} ${sc.color}`}>
                      <span className={`inline-flex size-1.5 rounded-full ${sc.color.replace("text-", "bg-")}`} />
                      {sc.label}
                    </span>
                    <span className={`text-xs ${mutedTextClass}`}>
                      {MARKETPLACE_CATEGORIES.find((c) => c.value === posting.category)?.label ?? posting.category}
                    </span>
                  </div>
                  <h1 className={`text-2xl font-bold tracking-tight leading-snug ${titleClass}`}>
                    {posting.title}
                  </h1>
                  <p className={`mt-1.5 text-sm ${mutedTextClass}`}>
                    Posted by{" "}
                    <span className={`font-medium ${titleClass}`}>
                      {posting.employerDisplayName ?? `${posting.employerWallet.slice(0, 6)}…${posting.employerWallet.slice(-4)}`}
                    </span>
                  </p>
                </div>
              </div>

              {/* Quick stats row */}
              <div className={`mt-5 grid grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-4 ${border} ${subtle}`}>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <DollarSign size={11} /> Budget
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{formatBudget(posting)}</p>
                </div>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <Clock size={11} /> Timeline
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{posting.timeline || "Flexible"}</p>
                </div>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <Users size={11} /> Proposals
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{posting.proposalCount}</p>
                </div>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <Calendar size={11} /> Deadline
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{formatDeadline(posting.proposalDeadline)}</p>
                </div>
              </div>

              {/* Description */}
              {(posting.description || posting.summary) && (
                <div className="mt-6">
                  <p className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>Description</p>
                  <div className={`text-sm leading-7 whitespace-pre-wrap ${titleClass}`}>
                    {posting.description || posting.summary}
                  </div>
                </div>
              )}

              {/* Skills */}
              {posting.skills.length > 0 && (
                <div className="mt-6">
                  <p className={`mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                    <Tag size={11} /> Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {posting.skills.map((skill) => (
                      <span key={skill} className={`rounded-full px-3 py-1 text-xs font-medium ${chipClass}`}>{skill}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Details grid */}
              <div className={`mt-6 grid gap-4 rounded-2xl border p-4 sm:grid-cols-3 ${border} ${subtle}`}>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <Briefcase size={11} /> Job type
                  </p>
                  <p className={`mt-1 text-sm ${titleClass}`}>
                    {MARKETPLACE_JOB_TYPES.find((t) => t.value === posting.jobType)?.label ?? posting.jobType}
                  </p>
                </div>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <FileText size={11} /> Experience
                  </p>
                  <p className={`mt-1 text-sm ${titleClass}`}>
                    {MARKETPLACE_EXPERIENCE_LEVELS.find((l) => l.value === posting.experienceLevel)?.label ?? posting.experienceLevel}
                  </p>
                </div>
                <div>
                  <p className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>
                    <Globe size={11} /> Visibility
                  </p>
                  <p className={`mt-1 text-sm capitalize ${titleClass}`}>{posting.visibility}</p>
                </div>
              </div>

              {/* Screening questions */}
              {posting.screeningQuestions.length > 0 && (
                <div className="mt-6">
                  <p className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>Screening questions</p>
                  <ol className="space-y-2">
                    {posting.screeningQuestions.map((q, i) => (
                      <li key={i} className={`rounded-xl border px-4 py-3 text-sm ${border} ${subtle} ${titleClass}`}>
                        <span className={`font-medium ${mutedTextClass} mr-2`}>{i + 1}.</span>{q}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Brief download */}
              {posting.hasBriefAttachment && session && (
                <button
                  type="button"
                  onClick={handleDownloadBrief}
                  className={`mt-6 inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition ${chipClass}`}
                >
                  <Download size={14} />
                  Download brief
                </button>
              )}

              {/* Global error */}
              {error && (
                <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: action panel ── */}
          <div ref={applyPanelRef} className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:self-start">

            {/* ── OWNER panel ── */}
            {isOwner ? (
              <div className={`rounded-2xl border p-5 space-y-4 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>Employer tools</p>
                  <p className={`mt-1 text-base font-semibold ${titleClass}`}>Manage this posting</p>
                </div>

                <div className="space-y-2">
                  <Link
                    href={`/postings/create?postingId=${posting.id}`}
                    className={`flex w-full h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${chipClass}`}
                  >
                    <Edit3 size={14} />
                    Edit posting
                  </Link>
                  <Link
                    href={`/postings/${posting.id}/proposals`}
                    className={`flex w-full h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${actionChipClass}`}
                  >
                    <Users size={14} />
                    Review proposals
                    {posting.proposalCount > 0 && (
                      <span className="ml-auto rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {posting.proposalCount}
                      </span>
                    )}
                  </Link>
                </div>

                <div className={`border-t pt-4 ${border} space-y-2`}>
                  <p className={`text-xs font-medium ${mutedTextClass}`}>Status actions</p>
                  {posting.status === "Draft" && (
                    <button type="button" disabled={isWorking} onClick={() => void handlePostingAction("publish")}
                      className={`flex w-full h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60 transition bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20`}>
                      Publish posting
                    </button>
                  )}
                  {posting.status === "Published" && (
                    <button type="button" disabled={isWorking} onClick={() => void handlePostingAction("close")}
                      className={`flex w-full h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:opacity-60 transition ${chipClass}`}>
                      Close posting
                    </button>
                  )}
                  {posting.status === "Closed" && (
                    <button type="button" disabled={isWorking} onClick={() => void handlePostingAction("reopen")}
                      className={`flex w-full h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60 transition ${actionChipClass}`}>
                      Reopen posting
                    </button>
                  )}
                </div>
              </div>

            ) : myProposal ? (
              /* ── ALREADY APPLIED panel ── */
              <div className={`rounded-2xl border p-5 space-y-4 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className={`text-sm font-semibold ${titleClass}`}>Proposal submitted</p>
                    <p className={`text-xs ${mutedTextClass}`}>
                      {new Date(myProposal.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Status badge */}
                {(() => {
                  const psc = proposalStatusConfig(myProposal.status);
                  return (
                    <div className={`rounded-xl border px-3 py-2.5 ${psc.bg}`}>
                      <p className={`text-xs font-semibold ${psc.color}`}>
                        {PROPOSAL_STATUS_LABELS[myProposal.status] ?? myProposal.status}
                      </p>
                    </div>
                  );
                })()}

                <div className={`rounded-xl border p-3 space-y-2 ${border} ${subtle}`}>
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Your amount</p>
                    <p className={`mt-0.5 text-sm font-semibold ${titleClass}`}>${myProposal.proposedAmount.toLocaleString()} USDT</p>
                  </div>
                  {myProposal.estimatedTimeline && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Timeline</p>
                      <p className={`mt-0.5 text-sm ${titleClass}`}>{myProposal.estimatedTimeline}</p>
                    </div>
                  )}
                </div>

                <Link href="/applications" className={`flex w-full h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${actionChipClass}`}>
                  View my applications
                </Link>

                {myProposal.hasCvAttachment && session && (
                  <button
                    type="button"
                    onClick={() => void downloadProposalCv(session, myProposal.id).catch((e) => notifyError(e instanceof Error ? e.message : "Unable to download CV."))}
                    className={`flex w-full h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition ${chipClass}`}
                  >
                    <Download size={13} />
                    Download my CV
                  </button>
                )}

                {myProposal.status === "Submitted" || myProposal.status === "Viewed" ? (
                  <button type="button" disabled={isWorking} onClick={handleWithdraw}
                    className={`flex w-full h-9 items-center justify-center text-sm font-medium disabled:opacity-50 transition ${mutedTextClass} hover:text-red-500`}>
                    Withdraw proposal
                  </button>
                ) : null}

                {session && (
                  <ProposalThread
                    proposalId={myProposal.id}
                    session={session}
                    currentWallet={address}
                    disabled={
                      myProposal.status === "Rejected" ||
                      myProposal.status === "Withdrawn" ||
                      myProposal.status === "ConvertedToOffer"
                    }
                  />
                )}
              </div>

            ) : canApply ? (
              /* ── APPLY panel ── */
              <div className={`rounded-2xl border p-5 space-y-4 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>Apply now</p>
                  <p className={`mt-1 text-base font-semibold ${titleClass}`}>Submit your proposal</p>
                  <p className={`mt-0.5 text-xs ${mutedTextClass}`}>
                    {posting.proposalCount === 0 ? "Be the first to apply." : `${posting.proposalCount} proposal${posting.proposalCount !== 1 ? "s" : ""} submitted.`}
                  </p>
                </div>

                {formError && (
                  <div className={`rounded-xl border px-3 py-2.5 text-xs ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {formError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Proposed amount (USDT) <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign size={13} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextClass}`} />
                      <input
                        className={`${inputClass} pl-8`}
                        inputMode="decimal"
                        value={proposedAmount}
                        onChange={(e) => setProposedAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      Cover letter <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      className={`${textareaClass} min-h-24`}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Introduce yourself and explain why you're a great fit…"
                    />
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>Estimated timeline</label>
                    <input className={inputClass} value={estimatedTimeline} onChange={(e) => setEstimatedTimeline(e.target.value)} placeholder="e.g. 2 weeks" />
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>Relevant experience</label>
                    <textarea
                      className={`${textareaClass} min-h-20`}
                      value={relevantExperience}
                      onChange={(e) => setRelevantExperience(e.target.value)}
                      placeholder="Describe similar projects you've completed…"
                    />
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>Portfolio links</label>
                    <input className={inputClass} value={portfolioLinks} onChange={(e) => setPortfolioLinks(e.target.value)} placeholder="https://… (comma-separated)" />
                  </div>

                  {/* CV / Resume upload */}
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                      CV / Resume <span className={`font-normal ${mutedTextClass}`}>(optional)</span>
                    </label>
                    <input
                      ref={cvInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                    />
                    {cvFile ? (
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${border} ${subtle}`}>
                        <Paperclip size={13} className="text-violet-400 shrink-0" />
                        <span className={`flex-1 truncate text-xs ${titleClass}`}>{cvFile.name}</span>
                        <span className={`text-[10px] ${mutedTextClass}`}>{(cvFile.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => { setCvFile(null); if (cvInputRef.current) cvInputRef.current.value = ""; }}
                          className={`shrink-0 rounded p-0.5 transition hover:text-red-500 ${mutedTextClass}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cvInputRef.current?.click()}
                        className={`flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs transition ${border} ${mutedTextClass} hover:border-violet-400 hover:text-violet-400`}
                      >
                        <Upload size={13} />
                        Attach PDF, DOC, or DOCX
                      </button>
                    )}
                  </div>

                  {posting.screeningQuestions.map((question, i) => (
                    <div key={question}>
                      <label className={`mb-1.5 block text-xs font-semibold ${tinyLabelClass}`}>
                        Q{i + 1}: {question}
                      </label>
                      <textarea
                        className={`${textareaClass} min-h-20`}
                        value={screeningAnswers[question] ?? ""}
                        onChange={(e) => setScreeningAnswers((cur) => ({ ...cur, [question]: e.target.value }))}
                        placeholder="Your answer…"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isWorking || !proposedAmount}
                  onClick={() => void handleApply()}
                  className={`flex w-full h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition ${actionChipClass}`}
                >
                  {cvUploading ? "Uploading CV…" : isWorking ? "Submitting…" : "Submit proposal"}
                </button>
              </div>

            ) : !session ? (
              /* ── NOT SIGNED IN ── */
              <div className={`rounded-2xl border p-5 text-center ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <p className={`text-sm font-semibold ${titleClass}`}>Sign in to apply</p>
                <p className={`mt-1 text-xs ${mutedTextClass}`}>Connect your wallet to submit a proposal.</p>
              </div>
            ) : (
              /* ── POSTING CLOSED / NOT ELIGIBLE ── */
              <div className={`rounded-2xl border p-5 text-center ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
                <p className={`text-sm font-semibold ${titleClass}`}>
                  {posting.status !== "Published" ? "This posting is no longer accepting proposals." : "Not eligible to apply."}
                </p>
                {posting.status !== "Published" && (
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>Status: {POSTING_STATUS_LABELS[posting.status] ?? posting.status}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
