"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Download, Paperclip } from "lucide-react";
import { useAccount } from "wagmi";
import ProposalThread from "@/components/marketplace/proposal-thread";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { getStoredAuthSession } from "@/lib/auth";
import { PROPOSAL_STATUS_LABELS } from "@/lib/marketplace-constants";
import { notifyError, notifySuccess } from "@/lib/notify";
import { fetchPostingById, type PostingResponse } from "@/lib/postings";
import {
  downloadProposalCv,
  fetchPostingProposals,
  rejectProposal,
  selectProposal,
  shortlistProposal,
  type ProposalResponse,
} from "@/lib/proposals";
import { getStoredProfile } from "@/lib/profile";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

function shortWallet(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function PostingProposalsPage() {
  const params = useParams<{ id: string }>();
  const postingId = Number(params.id);
  const { address, isConnected } = useAccount();
  const {
    pageClass,
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    chipClass,
    actionChipClass,
    isDarkTheme,
  } = useThemeStyles();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const session = useMemo(() => {
    if (!address) return null;
    const s = getStoredAuthSession();
    if (!s) return null;
    return s.walletAddress.toLowerCase() === address.toLowerCase() ? s : null;
  }, [address]);
  const [posting, setPosting] = useState<PostingResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalResponse[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (!session) return;
      if (!silent) {
        setIsLoading(true);
        setError("");
      }

      try {
        const [nextPosting, nextProposals] = await Promise.all([
          fetchPostingById(postingId),
          fetchPostingProposals(session, postingId),
        ]);
        setPosting(nextPosting);
        setProposals(nextProposals);
        setSelectedProposalId((current) => current ?? nextProposals[0]?.id ?? null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load proposals.";
        setError(message);
        if (!silent) notifyError(message);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [postingId, session]
  );

  useEffect(() => {
    void loadWorkspace(false);
  }, [loadWorkspace]);

  useVisibleInterval(
    () => void loadWorkspace(true),
    API_POLL_INTERVAL_MS,
    Boolean(session && postingId > 0)
  );

  const selectedProposal = proposals.find((item) => item.id === selectedProposalId) ?? proposals[0] ?? null;

  const handleAction = async (
    proposalId: number,
    action: "shortlist" | "reject" | "select"
  ) => {
    if (!session) return;
    setIsWorking(true);
    try {
      const updated =
        action === "shortlist"
          ? await shortlistProposal(session, proposalId)
          : action === "reject"
            ? await rejectProposal(session, proposalId)
            : await selectProposal(session, proposalId);

      setProposals((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      if (action === "select") {
        await loadWorkspace(true);
      }
      notifySuccess(
        action === "shortlist"
          ? "Proposal shortlisted."
          : action === "reject"
            ? "Proposal rejected."
            : "Proposal selected."
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to update proposal.";
      setError(message);
      notifyError(message);
    } finally {
      setIsWorking(false);
    }
  };

  if (profile?.role !== "employer" && profile?.role !== "both") {
    return (
      <div className={pageClass}>
        <section className={`mx-auto w-full max-w-[1200px] ${panelClass} rounded-2xl px-6 py-8`}>
          <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
            Employer access required
          </h1>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1600px] space-y-5">
        <article className={`${panelClass} rounded-2xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Proposal review
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            {posting?.title ?? "Posting proposals"}
          </h1>
          <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
            Compare applicants, keep the conversation inside the proposal thread, and move the chosen freelancer into the formal offer flow.
          </p>
        </article>

        {error ? (
          <p className={`rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className={`text-sm ${mutedTextClass}`}>Loading proposals...</p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <article className={`${panelClass} rounded-2xl p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Applicants</p>
                  <h2 className={`mt-1 text-xl font-semibold ${titleClass}`}>Proposal queue</h2>
                </div>
                <span className={`text-xs ${mutedTextClass}`}>{proposals.length} total</span>
              </div>

              <div className="mt-4 space-y-3">
                {proposals.map((proposal) => {
                  const active = selectedProposal?.id === proposal.id;
                  return (
                    <button
                      key={proposal.id}
                      type="button"
                      onClick={() => setSelectedProposalId(proposal.id)}
                      className={`${subtlePanelClass} w-full rounded-2xl p-4 text-left transition ${
                        active ? "border-violet-300/50 bg-violet-500/10" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${titleClass}`}>
                            {proposal.freelancerDisplayName || shortWallet(proposal.freelancerWallet)}
                          </p>
                          <p className={`mt-1 text-xs ${mutedTextClass}`}>
                            {shortWallet(proposal.freelancerWallet)}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chipClass}`}>
                          {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <p className={`text-sm ${mutedTextClass}`}>
                          {proposal.proposedAmount.toLocaleString()} USDT
                        </p>
                        <p className={`text-sm ${mutedTextClass}`}>
                          {proposal.estimatedTimeline || "No timeline"}
                        </p>
                      </div>
                      {proposal.hasCvAttachment && (
                        <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${isDarkTheme ? "text-violet-400" : "text-violet-600"}`}>
                          <Paperclip size={10} />
                          CV attached
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </article>

            <article className={`${panelClass} rounded-2xl p-5`}>
              {selectedProposal ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Selected proposal</p>
                      <h2 className={`mt-1 text-xl font-semibold ${titleClass}`}>
                        {selectedProposal.freelancerDisplayName || shortWallet(selectedProposal.freelancerWallet)}
                      </h2>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chipClass}`}>
                      {PROPOSAL_STATUS_LABELS[selectedProposal.status] ?? selectedProposal.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className={`${subtlePanelClass} rounded-2xl p-4`}>
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Amount</p>
                      <p className={`mt-2 text-lg font-semibold ${titleClass}`}>
                        {selectedProposal.proposedAmount.toLocaleString()} USDT
                      </p>
                    </div>
                    <div className={`${subtlePanelClass} rounded-2xl p-4`}>
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Timeline</p>
                      <p className={`mt-2 text-lg font-semibold ${titleClass}`}>
                        {selectedProposal.estimatedTimeline || "Not specified"}
                      </p>
                    </div>
                  </div>

                  <div className={`${subtlePanelClass} mt-5 rounded-2xl p-4`}>
                    <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Cover letter</p>
                    <p className={`mt-2 whitespace-pre-wrap text-sm leading-7 ${titleClass}`}>
                      {selectedProposal.coverLetter || "No cover letter provided."}
                    </p>
                  </div>

                  {selectedProposal.relevantExperience ? (
                    <div className={`${subtlePanelClass} mt-4 rounded-2xl p-4`}>
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Relevant experience</p>
                      <p className={`mt-2 whitespace-pre-wrap text-sm leading-7 ${titleClass}`}>
                        {selectedProposal.relevantExperience}
                      </p>
                    </div>
                  ) : null}

                  {selectedProposal.hasCvAttachment && session && (
                    <div className={`${subtlePanelClass} mt-4 flex items-center gap-3 rounded-2xl p-4`}>
                      <Paperclip size={15} className="text-violet-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>CV / Resume</p>
                        <p className={`mt-0.5 text-xs ${mutedTextClass}`}>Applicant attached a CV with their proposal</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void downloadProposalCv(session, selectedProposal.id).catch((e) => notifyError(e instanceof Error ? e.message : "Unable to download CV."))}
                        className={`${chipClass} inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium`}
                      >
                        <Download size={13} />
                        Download
                      </button>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {selectedProposal.status !== "Selected" && selectedProposal.status !== "ConvertedToOffer" ? (
                      <button type="button" disabled={isWorking} onClick={() => void handleAction(selectedProposal.id, "shortlist")} className={`${chipClass} inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold disabled:opacity-60`}>
                        Shortlist
                      </button>
                    ) : null}
                    {selectedProposal.status !== "Selected" && selectedProposal.status !== "ConvertedToOffer" ? (
                      <button type="button" disabled={isWorking} onClick={() => void handleAction(selectedProposal.id, "select")} className={`${actionChipClass} inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold disabled:opacity-60`}>
                        Select proposal
                      </button>
                    ) : null}
                    {selectedProposal.status !== "Rejected" && selectedProposal.status !== "ConvertedToOffer" ? (
                      <button type="button" disabled={isWorking} onClick={() => void handleAction(selectedProposal.id, "reject")} className={`${chipClass} inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold disabled:opacity-60`}>
                        Reject
                      </button>
                    ) : null}
                    {selectedProposal.status === "Selected" ? (
                      <Link
                        href={`/jobs/create?proposalId=${selectedProposal.id}&postingId=${postingId}&freelancer=${selectedProposal.freelancerWallet}&title=${encodeURIComponent(posting?.title ?? selectedProposal.postingTitle)}&description=${encodeURIComponent(posting?.description ?? "")}&amount=${selectedProposal.proposedAmount}`}
                        className={`${actionChipClass} inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold`}
                      >
                        Create offer
                        <ArrowRight size={16} />
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    <ProposalThread
                      proposalId={selectedProposal.id}
                      session={session}
                      currentWallet={address}
                      disabled={selectedProposal.status === "Rejected" || selectedProposal.status === "Withdrawn" || selectedProposal.status === "ConvertedToOffer"}
                    />
                  </div>
                </>
              ) : (
                <p className={`text-sm ${mutedTextClass}`}>No proposals yet.</p>
              )}
            </article>
          </div>
        )}
      </section>
    </div>
  );
}
