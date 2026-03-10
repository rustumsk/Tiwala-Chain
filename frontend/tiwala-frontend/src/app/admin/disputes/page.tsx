"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useReadContract, useReadContracts } from "wagmi";
import { useAppTheme } from "@/components/layout/theme-context";
import {
  tiwalaEscrowAbi,
  TIWALA_ESCROW_ADDRESS,
  type EscrowJobStatus,
} from "@/lib/contract";
import { getStoredProfile } from "@/lib/profile";
import { getStoredAuthSession } from "@/lib/auth";
import {
  fetchJobByHash,
  downloadJobContractByHashBlob,
} from "@/lib/jobs";
import {
  listDeliverablesByHash,
  downloadDeliverableAttachmentBlob,
  type Deliverable,
} from "@/lib/deliverables";
import { notifyError } from "@/lib/notify";
import type { Address, Hex } from "viem";

type ParsedJob = {
  id: bigint;
  employer: Address;
  freelancer: Address;
  amount: bigint;
  status: EscrowJobStatus;
  contractHash: Hex;
};

type EnrichedJob = ParsedJob & {
  offchainJob?: {
    title: string;
    description: string | null;
    amountUsdt: number;
  };
  deliverables: Deliverable[] | null;
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUsdt(amount: bigint) {
  const v = Number(amount) / 1_000_000;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminDisputesPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { isDarkTheme } = useAppTheme();

  const { data: txHash, error: txError, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: Boolean(txHash) } });

  const [confirmJobId, setConfirmJobId] = useState<bigint | null>(null);
  const [confirmAction, setConfirmAction] = useState<"freelancer" | "employer" | null>(null);

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const isAdmin = profile?.role === "admin";

  const counterQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "jobCounter",
    query: { enabled: isAdmin },
  });

  const jobCount = typeof counterQuery.data === "bigint" ? Number(counterQuery.data) : 0;

  const jobContracts = useMemo(
    () =>
      Array.from({ length: jobCount }, (_, i) => ({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "getJob" as const,
        args: [BigInt(i + 1)] as const,
      })),
    [jobCount]
  );

  const jobsQuery = useReadContracts({
    contracts: jobContracts,
    query: { enabled: jobCount > 0 },
    allowFailure: true,
  });

  const disputedJobs: ParsedJob[] = useMemo(() => {
    if (!jobsQuery.data) return [];
    return jobsQuery.data
      .map((entry, index) => {
        if (entry.status !== "success" || !entry.result) return null;
        const r = entry.result as Record<string, unknown>;
        const status = typeof r.status === "number" ? r.status : typeof r.status === "bigint" ? Number(r.status) : -1;
        if (status !== 4) return null;
        return {
          id: BigInt(index + 1),
          employer: r.employer as Address,
          freelancer: r.freelancer as Address,
          amount: r.amount as bigint,
          status: status as EscrowJobStatus,
          contractHash: r.contractHash as Hex,
        };
      })
      .filter((j): j is ParsedJob => j !== null);
  }, [jobsQuery.data]);

  const [enriched, setEnriched] = useState<Record<string, EnrichedJob>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      const baseSession = getStoredAuthSession();
      if (!baseSession) return;
      const map: Record<string, EnrichedJob> = {};
      for (const j of disputedJobs) {
        const key = j.id.toString();
        try {
          const contractHash = j.contractHash as string;
          const [job, deliverables] = await Promise.all([
            fetchJobByHash(baseSession, contractHash).catch(() => null),
            listDeliverablesByHash(baseSession, contractHash).catch(() => []),
          ]);
          map[key] = {
            ...j,
            offchainJob: job
              ? {
                  title: job.title,
                  description: job.description,
                  amountUsdt: job.amountUsdt,
                }
              : undefined,
            deliverables,
          };
        } catch {
          map[key] = { ...j, offchainJob: undefined, deliverables: null };
        }
      }
      if (!cancelled) {
        setEnriched(map);
      }
    }
    if (disputedJobs.length) {
      void loadDetails();
    } else {
      setEnriched({});
    }
    return () => {
      cancelled = true;
    };
  }, [disputedJobs]);

  const handleResolve = (jobId: bigint, releaseToFreelancer: boolean) => {
    writeContract({
      address: TIWALA_ESCROW_ADDRESS,
      abi: tiwalaEscrowAbi,
      functionName: "resolveDispute",
      args: [jobId, releaseToFreelancer],
    });
    setConfirmJobId(null);
    setConfirmAction(null);
  };

  const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const actionChipClass = isDarkTheme
    ? "border border-violet-300/30 bg-violet-500/14 text-violet-100"
    : "border border-violet-200 bg-violet-50 text-violet-700";

  if (!isAdmin) {
    return (
      <div className={pageClass}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8`}>
          <h1 className={`text-2xl font-semibold ${titleClass}`}>Access denied</h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>Admin access required.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Moderator
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Dispute resolution
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            Review disputed jobs and decide whether to release payment to the freelancer or refund the employer.
          </p>
          {chainId !== 11155111 ? (
            <p className={`mt-4 rounded-xl border p-4 text-sm ${isDarkTheme ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              Switch to Sepolia to resolve disputes on-chain.
            </p>
          ) : null}
        </article>

        {txError ? (
          <div className={`${panelClass} rounded-xl p-4 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
            Transaction error: {txError.message}
          </div>
        ) : null}

        {receipt.isLoading ? (
          <div className={`${panelClass} rounded-xl p-4 text-sm ${mutedTextClass}`}>
            Waiting for on-chain confirmation...
          </div>
        ) : null}

        {receipt.isSuccess ? (
          <div className={`${panelClass} rounded-xl p-4 text-sm ${isDarkTheme ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            Dispute resolved successfully. Refresh to see updated status.
          </div>
        ) : null}

        {counterQuery.isLoading || jobsQuery.isLoading ? (
          <article className={`${panelClass} rounded-xl p-6`}>
            <p className={`text-sm ${mutedTextClass}`}>Loading disputed jobs...</p>
          </article>
        ) : disputedJobs.length === 0 ? (
          <article className={`${panelClass} rounded-xl p-6`}>
            <p className={`text-sm ${mutedTextClass}`}>No disputed jobs found. All clear.</p>
          </article>
        ) : (
          <div className="space-y-4">
            {disputedJobs.map((job) => {
              const key = job.id.toString();
              const extra = enriched[key];
              const off = extra?.offchainJob;
              const deliverables = extra?.deliverables ?? null;
              return (
              <article key={key} className={`${panelClass} rounded-xl p-6 lg:p-7`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
                      Job #{key}
                    </p>
                    <h3 className={`mt-1 text-lg font-semibold ${titleClass}`}>
                      Disputed &middot; {formatUsdt(job.amount)} USDT
                    </h3>
                    {off ? (
                      <p className={`mt-1 text-sm ${mutedTextClass}`}>
                        {off.title} · Offer amount:{" "}
                        <span className="font-semibold">
                          {off.amountUsdt.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}{" "}
                          USDT
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                    Disputed
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className={`${subtlePanelClass} rounded-xl p-3`}>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Employer</p>
                    <p className={`mt-1 truncate font-mono text-xs ${titleClass}`}>{shortAddr(job.employer)}</p>
                  </div>
                  <div className={`${subtlePanelClass} rounded-xl p-3`}>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Freelancer</p>
                    <p className={`mt-1 truncate font-mono text-xs ${titleClass}`}>{shortAddr(job.freelancer)}</p>
                  </div>
                  <div className={`${subtlePanelClass} rounded-xl p-3`}>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Escrow amount</p>
                    <p className={`mt-1 font-semibold tabular-nums ${titleClass}`}>{formatUsdt(job.amount)} USDT</p>
                  </div>
                  <div className={`${subtlePanelClass} rounded-xl p-3`}>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${tinyLabelClass}`}>Contract hash</p>
                    <p className={`mt-1 truncate font-mono text-[10px] ${mutedTextClass}`}>{job.contractHash}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className={`inline-flex items-center rounded-xl border px-3 py-1.5 font-semibold transition ${
                      isDarkTheme
                        ? "border-white/20 bg-white/[0.03] text-white/80 hover:border-violet-300/40 hover:bg-violet-500/15"
                        : "border-[#dde1ec] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50"
                    }`}
                    onClick={async () => {
                      try {
                        const session = getStoredAuthSession();
                        if (!session) {
                          notifyError("Please sign in with your admin wallet first.");
                          return;
                        }
                        const blob = await downloadJobContractByHashBlob(
                          session,
                          job.contractHash as string
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `job-${key}-contract.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        notifyError(
                          err instanceof Error
                            ? err.message
                            : "Unable to download contract."
                        );
                      }
                    }}
                  >
                    Download contract
                  </button>
                </div>

                {deliverables && deliverables.length > 0 ? (
                  <div className="mt-5 rounded-xl px-4 py-3 text-sm lg:px-5 lg:py-4">
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                      Submissions
                    </p>
                    <div className="mt-3 space-y-3">
                      {deliverables.map((d, idx) => {
                        const submissionNumber = deliverables.length - idx;
                        return (
                          <div
                            key={d.id}
                            className={`${subtlePanelClass} flex flex-col gap-3 rounded-xl p-4`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                                  Submission #{submissionNumber}
                                </p>
                                <p className={`mt-1 text-xs ${mutedTextClass}`}>
                                  {new Date(d.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-white/80">
                                {d.status}
                              </span>
                            </div>

                            {d.note ? (
                              <p className={`text-xs leading-relaxed ${mutedTextClass}`}>
                                {d.note}
                              </p>
                            ) : (
                              <p className={`text-xs italic ${mutedTextClass}`}>
                                No note provided.
                              </p>
                            )}

                            {d.attachments.length ? (
                              <div className="mt-1 space-y-1">
                                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                                  Attachments
                                </p>
                                <ul className="space-y-1 text-xs">
                                  {d.attachments.map((a) => (
                                    <li
                                      key={a.id}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      {a.type === "Link" && a.url ? (
                                        <>
                                          <a
                                            href={a.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`truncate underline underline-offset-2 ${mutedTextClass}`}
                                          >
                                            {a.url}
                                          </a>
                                        </>
                                      ) : a.type === "File" && a.fileName ? (
                                        <>
                                          <span className={`truncate ${mutedTextClass}`}>
                                            {a.fileName}
                                          </span>
                                          <button
                                            type="button"
                                            className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                                              isDarkTheme
                                                ? "border-white/20 text-white/80 hover:border-violet-300/40 hover:bg-violet-500/15"
                                                : "border-[#dde1ec] text-[#242838] hover:border-violet-300 hover:bg-violet-50"
                                            }`}
                                            onClick={async () => {
                                              try {
                                                const session = getStoredAuthSession();
                                                if (!session) {
                                                  notifyError(
                                                    "Please sign in with your admin wallet first."
                                                  );
                                                  return;
                                                }
                                                const blob =
                                                  await downloadDeliverableAttachmentBlob(
                                                    session,
                                                    a.id
                                                  );
                                                const url = URL.createObjectURL(blob);
                                                const link = document.createElement("a");
                                                link.href = url;
                                                link.download = a.fileName ?? "attachment";
                                                document.body.appendChild(link);
                                                link.click();
                                                link.remove();
                                                URL.revokeObjectURL(url);
                                              } catch (err) {
                                                notifyError(
                                                  err instanceof Error
                                                    ? err.message
                                                    : "Unable to download attachment."
                                                );
                                              }
                                            }}
                                          >
                                            Download
                                          </button>
                                        </>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className={`mt-4 text-xs ${mutedTextClass}`}>
                    No off-chain submissions found yet for this contract.
                  </p>
                )}

                {confirmJobId === job.id ? (
                  <div className={`mt-5 rounded-xl border p-4 ${isDarkTheme ? "border-white/12 bg-[#0b0f1a]" : "border-[#e6e8f1] bg-white"}`}>
                    <p className={`text-sm font-medium ${titleClass}`}>
                      {confirmAction === "freelancer"
                        ? "Release payment to the freelancer?"
                        : "Refund payment to the employer?"}
                    </p>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      This action is irreversible and will be recorded on-chain.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleResolve(job.id, confirmAction === "freelancer")}
                        className={`inline-flex h-9 items-center rounded-xl px-4 text-xs font-semibold transition disabled:opacity-60 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
                      >
                        {isPending ? "Confirming..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmJobId(null); setConfirmAction(null); }}
                        className={`inline-flex h-9 items-center rounded-xl px-4 text-xs font-medium transition ${isDarkTheme ? "border border-white/12 text-white/70 hover:bg-white/[0.04]" : "border border-[#dde1ec] text-[#4b5164] hover:bg-[#f3f4f9]"}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isPending || chainId !== 11155111}
                      onClick={() => { setConfirmJobId(job.id); setConfirmAction("freelancer"); }}
                      className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60 ${isDarkTheme ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/50 hover:bg-emerald-500/20" : "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400"}`}
                    >
                      Release to freelancer
                    </button>
                    <button
                      type="button"
                      disabled={isPending || chainId !== 11155111}
                      onClick={() => { setConfirmJobId(job.id); setConfirmAction("employer"); }}
                      className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60 ${isDarkTheme ? "border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:border-amber-300/50 hover:bg-amber-500/20" : "border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400"}`}
                    >
                      Refund to employer
                    </button>
                  </div>
                )}
              </article>
            );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
