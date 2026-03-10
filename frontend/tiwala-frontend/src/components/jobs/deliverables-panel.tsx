"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileUp, Link2, ShieldCheck, RotateCcw, Download } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import { getStoredAuthSession } from "@/lib/auth";
import {
  approveDeliverable,
  downloadDeliverableAttachmentBlob,
  listDeliverablesByHash,
  prettyBytes,
  requestRevision,
  submitDeliverableByHash,
  type Deliverable,
} from "@/lib/deliverables";
import { notifyError, notifySuccess } from "@/lib/notify";

type DeliverablesPanelProps = {
  contractHash: string;
  canActAsEmployer: boolean;
  canActAsFreelancer: boolean;
  canSubmit: boolean;
};

function statusTone(isDark: boolean, status: string) {
  const s = status.toLowerCase();
  if (s.includes("approved")) {
    return isDark
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (s.includes("revision")) {
    return isDark
      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
      : "border-amber-200 bg-amber-50 text-amber-700";
  }
  return isDark
    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
    : "border-cyan-200 bg-cyan-50 text-cyan-800";
}

function labelForStatus(status: string) {
  if (status === "PendingReview") return "Pending review";
  if (status === "Approved") return "Approved";
  if (status === "RevisionRequested") return "Revision requested";
  return status;
}

export default function DeliverablesPanel({
  contractHash,
  canActAsEmployer,
  canActAsFreelancer,
  canSubmit,
}: DeliverablesPanelProps) {
  const { isDarkTheme } = useAppTheme();

  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/28"
    : "border border-[#e4e8f2] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.07)]";
  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const inputClass = isDarkTheme
    ? "h-10 w-full rounded-xl border border-white/14 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-violet-400/50"
    : "h-10 w-full rounded-xl border border-[#e1e4f0] bg-white px-3 text-sm text-[#11131b] outline-none placeholder:text-[#73788b] focus:border-violet-400";
  const textareaClass = isDarkTheme
    ? "min-h-24 w-full rounded-xl border border-white/14 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-violet-400/50"
    : "min-h-24 w-full rounded-xl border border-[#e1e4f0] bg-white px-3 py-2 text-sm text-[#11131b] outline-none placeholder:text-[#73788b] focus:border-violet-400";
  const buttonClass = isDarkTheme
    ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50 transition hover:border-violet-200/60 hover:bg-violet-500/25 disabled:opacity-60"
    : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60";

  const [items, setItems] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingDeliverableId, setEditingDeliverableId] = useState<number | null>(
    null
  );

  const selected = useMemo(
    () => items.find((d) => d.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );

  const effectiveCanSubmit = canSubmit;

  const timeline = useMemo(() => {
    const asc = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const map = new Map<number, number>();
    asc.forEach((d, idx) => map.set(d.id, idx + 1));
    return map;
  }, [items]);

  const refresh = async () => {
    const session = getStoredAuthSession();
    if (!session) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await listDeliverablesByHash(session, contractHash);
      setItems(data);
      setSelectedId((prev) => prev ?? data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliverables.");
      notifyError("Failed to load deliverables.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [contractHash]);

  // freelancer submission state
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // employer review state
  const [reviewNote, setReviewNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | null
    | { kind: "approve" | "revision"; deliverableId: number; title: string }
  >(null);
  const [isReviewing, setIsReviewing] = useState(false);

  return (
    <article className={`${panelClass} rounded-3xl p-6 lg:p-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
            Deliverables
          </p>
          <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
            Submissions & review
          </h2>
          <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
            Share work as links, images, files, or videos. Submissions are shown in order so
            both parties can track progress and revisions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canActAsFreelancer && items.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setEditingDeliverableId(null);
                setSelectedId(null);
                setNote("");
                setLinks([""]);
                setFiles([]);
              }}
              className={`text-xs font-semibold ${
                isDarkTheme ? "text-white/75 hover:text-white" : "text-[#555a6b]"
              }`}
            >
              + New deliverable
            </button>
          ) : null}
          <button type="button" onClick={() => void refresh()} className={buttonClass}>
            <RotateCcw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            isDarkTheme
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className={`${subtlePanelClass} rounded-2xl p-4`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs font-semibold ${titleClass}`}>Submission timeline</p>
            <span className={`text-xs ${mutedTextClass}`}>{items.length} total</span>
          </div>

          {isLoading ? (
            <p className={`mt-3 text-sm ${mutedTextClass}`}>Loading submissions…</p>
          ) : items.length === 0 ? (
            <p className={`mt-3 text-sm ${mutedTextClass}`}>
              No deliverables yet. Once the employer starts the job, the freelancer can submit
              work here.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {items.map((d) => {
                const active = (selected?.id ?? null) === d.id;
                const n = timeline.get(d.id) ?? 0;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(d.id);
                      // If freelancer clicks a revision-requested submission, enter edit mode
                      if (
                        canActAsFreelancer &&
                        d.status === "RevisionRequested"
                      ) {
                        setEditingDeliverableId(d.id);
                        setNote(d.note ?? "");
                        const linkValues =
                          d.attachments
                            .filter((a) => a.type === "Link" && a.url)
                            .map((a) => a.url!) || [];
                        setLinks(linkValues.length ? linkValues : [""]);
                        setFiles([]);
                      } else {
                        setEditingDeliverableId(null);
                      }
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? isDarkTheme
                          ? "border-violet-300/45 bg-violet-500/10"
                          : "border-violet-300 bg-violet-50"
                        : isDarkTheme
                        ? "border-white/10 bg-black/20 hover:border-violet-300/30 hover:bg-violet-500/10"
                        : "border-[#e6e8f1] bg-white hover:border-violet-200 hover:bg-violet-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-xs ${tinyLabelClass}`}>Submission #{n}</p>
                        <p className={`mt-1 text-sm font-semibold ${titleClass}`}>
                          {new Date(d.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${statusTone(
                          isDarkTheme,
                          d.status
                        )}`}
                      >
                        {labelForStatus(d.status)}
                      </span>
                    </div>
                    {d.reviewNote ? (
                      <p className={`mt-2 text-xs ${mutedTextClass}`}>
                        Employer note: {d.reviewNote}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {canActAsFreelancer && (effectiveCanSubmit || editingDeliverableId !== null) ? (
            <div className={`${subtlePanelClass} rounded-2xl p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs font-semibold ${titleClass}`}>Submit deliverables</p>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    Add links (Figma, GitHub, Drive) and attach files (images, PDFs, zip, or videos).
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    effectiveCanSubmit
                      ? isDarkTheme
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : isDarkTheme
                      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {effectiveCanSubmit ? "Open" : "Locked"}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className={`mb-2 block text-xs font-medium ${tinyLabelClass}`}>
                    Notes
                  </label>
                  <textarea
                    className={textareaClass}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What did you deliver? Any setup steps, credentials, or context?"
                    disabled={!effectiveCanSubmit || isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={`block text-xs font-medium ${tinyLabelClass}`}>
                      Links
                    </label>
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => [...prev, ""])}
                      className={`text-xs font-semibold ${
                        isDarkTheme ? "text-violet-200" : "text-violet-700"
                      }`}
                      disabled={!effectiveCanSubmit || isSubmitting}
                    >
                      + Add link
                    </button>
                  </div>

                  {links.map((value, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35">
                          <Link2 size={14} />
                        </span>
                        <input
                          className={`${inputClass} pl-9`}
                          value={value}
                          onChange={(e) =>
                            setLinks((prev) => {
                              const next = [...prev];
                              next[idx] = e.target.value;
                              return next;
                            })
                          }
                          placeholder="https://…"
                          disabled={!effectiveCanSubmit || isSubmitting}
                        />
                      </div>
                      {links.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLinks((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className={`h-10 rounded-xl border px-3 text-xs font-semibold transition ${
                            isDarkTheme
                              ? "border-white/12 text-white/70 hover:border-red-400/40 hover:text-red-200"
                              : "border-[#e1e4f0] text-[#5c6172] hover:border-red-200 hover:text-red-700"
                          }`}
                          disabled={!effectiveCanSubmit || isSubmitting}
                          aria-label="Remove link"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div>
                  <label className={`mb-2 block text-xs font-medium ${tinyLabelClass}`}>
                    Files (images, docs, zip, or video)
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                    disabled={!effectiveCanSubmit || isSubmitting}
                    className={`block w-full rounded-xl border p-3 text-sm ${
                      isDarkTheme
                        ? "border-white/14 bg-black/40 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-2 file:text-white/90 hover:file:bg-white/[0.1]"
                        : "border-[#e1e4f0] bg-white text-[#2a3040] file:mr-4 file:rounded-lg file:border-0 file:bg-[#e8ecf4] file:px-3 file:py-2 file:text-[#2a3040] hover:file:bg-[#dce2f0]"
                    }`}
                  />
                  {files.length ? (
                    <div className="mt-2 space-y-1">
                      {files.slice(0, 5).map((f) => (
                        <p key={f.name} className={`text-xs ${mutedTextClass}`}>
                          {f.name} {f.size ? `• ${prettyBytes(f.size)}` : ""}
                        </p>
                      ))}
                      {files.length > 5 ? (
                        <p className={`text-xs ${mutedTextClass}`}>
                          +{files.length - 5} more
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!effectiveCanSubmit || isSubmitting}
                    onClick={async () => {
                      const session = getStoredAuthSession();
                      if (!session) {
                        setError("Please sign in with your wallet first.");
                        notifyError("Please sign in with your wallet first.");
                        return;
                      }

                      const cleanLinks = links
                        .map((l) => l.trim())
                        .filter((l) => Boolean(l));

                      setIsSubmitting(true);
                      setError("");
                      try {
                        await submitDeliverableByHash({
                          session,
                          contractHash,
                          note: note.trim() ? note.trim() : undefined,
                          links: cleanLinks,
                          files,
                          // when editingDeliverableId is set, backend updates that row instead of creating a new one
                          deliverableId: editingDeliverableId ?? undefined,
                        } as any);
                        setNote("");
                        setLinks([""]);
                        setFiles([]);
                        setEditingDeliverableId(null);
                        await refresh();
                        notifySuccess(
                          editingDeliverableId
                            ? "Submission updated."
                            : "Deliverables submitted."
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Failed to submit deliverables."
                        );
                        notifyError(
                          err instanceof Error
                            ? err.message
                            : "Failed to submit deliverables."
                        );
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    <FileUp size={15} />
                    {isSubmitting
                      ? "Saving…"
                      : editingDeliverableId
                      ? "Update submission"
                      : "Submit deliverables"}
                  </button>
                  {items.length > 0 ? (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setEditingDeliverableId(null);
                        setNote("");
                        setLinks([""]);
                        setFiles([]);
                      }}
                      className={`text-xs font-semibold ${
                        isDarkTheme ? "text-white/70 hover:text-white" : "text-[#555a6b]"
                      }`}
                    >
                      + New deliverable
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {selected ? (
            <div className={`${subtlePanelClass} rounded-2xl p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs ${tinyLabelClass}`}>
                    Submission #{timeline.get(selected.id) ?? 0}
                  </p>
                  <h3 className={`mt-1 text-lg font-semibold ${titleClass}`}>
                    {labelForStatus(selected.status)}
                  </h3>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    Submitted {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusTone(
                    isDarkTheme,
                    selected.status
                  )}`}
                >
                  {labelForStatus(selected.status)}
                </span>
              </div>

              {selected.note ? (
                <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${mutedTextClass}`}>
                  {selected.note}
                </p>
              ) : (
                <p className={`mt-3 text-sm ${mutedTextClass}`}>No notes provided.</p>
              )}

              {selected.attachments.length ? (
                <div className="mt-4 space-y-2">
                  <p className={`text-xs font-semibold ${titleClass}`}>Attachments</p>
                  <div className="space-y-2">
                    {selected.attachments.map((a) => {
                      if (a.type === "Link" && a.url) {
                        return (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                              isDarkTheme
                                ? "border-white/12 bg-black/20 text-white/85 hover:border-violet-300/35 hover:bg-violet-500/10"
                                : "border-[#e1e4f0] bg-white text-[#242838] hover:border-violet-300 hover:bg-violet-50"
                            }`}
                          >
                            <span className="truncate">{a.url}</span>
                            <ExternalLink size={14} className="shrink-0 opacity-70" />
                          </a>
                        );
                      }

                      return (
                        <div
                          key={a.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                            isDarkTheme
                              ? "border-white/12 bg-black/20 text-white/85"
                              : "border-[#e1e4f0] bg-white text-[#242838]"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              {a.fileName ?? "File"}{" "}
                              {a.sizeBytes ? (
                                <span className={`text-xs ${mutedTextClass}`}>
                                  • {prettyBytes(a.sizeBytes)}
                                </span>
                              ) : null}
                            </p>
                            {a.contentType ? (
                              <p className={`mt-0.5 text-[11px] ${mutedTextClass}`}>
                                {a.contentType}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const session = getStoredAuthSession();
                              if (!session) {
                                setError("Please sign in with your wallet first.");
                                return;
                              }
                              try {
                                const blob = await downloadDeliverableAttachmentBlob(
                                  session,
                                  a.id
                                );
                                const url = URL.createObjectURL(blob);
                                const anchor = document.createElement("a");
                                anchor.href = url;
                                anchor.download = a.fileName ?? "deliverable-file";
                                document.body.appendChild(anchor);
                                anchor.click();
                                anchor.remove();
                                URL.revokeObjectURL(url);
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Unable to download file."
                                );
                              }
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                              isDarkTheme
                                ? "border-white/14 bg-white/[0.02] text-white/80 hover:border-violet-300/40 hover:bg-violet-500/15"
                                : "border-[#e1e4f0] bg-white text-[#37405a] hover:border-violet-300 hover:bg-violet-50"
                            }`}
                          >
                            <Download size={12} />
                            Download
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {canActAsEmployer ? (
                <div className="mt-5 space-y-3">
                  <p className={`text-xs font-semibold ${titleClass}`}>Employer review</p>
                  <textarea
                    className={textareaClass}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Optional note for the freelancer…"
                    disabled={isReviewing}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isReviewing || selected.status !== "PendingReview"}
                      onClick={() =>
                        setConfirmAction({
                          kind: "approve",
                          deliverableId: selected.id,
                          title: "Approve this submission?",
                        })
                      }
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                        isDarkTheme
                          ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/28"
                          : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      <ShieldCheck size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isReviewing || selected.status !== "PendingReview"}
                      onClick={() =>
                        setConfirmAction({
                          kind: "revision",
                          deliverableId: selected.id,
                          title: "Request a revision?",
                        })
                      }
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                        isDarkTheme
                          ? "border-amber-300/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/22"
                          : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      }`}
                    >
                      Request revision
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={`${subtlePanelClass} rounded-2xl p-4`}>
              <p className={`text-sm ${mutedTextClass}`}>
                Select a submission to see details.
              </p>
            </div>
          )}
        </section>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`w-full max-w-sm rounded-xl border px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${
              isDarkTheme ? "border-white/14 bg-[#050814]" : "border-[#e3e5f2] bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500/80">
              Confirm review
            </p>
            <h2 className={`mt-2 text-lg font-semibold ${titleClass}`}>
              {confirmAction.title}
            </h2>
            <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
              {confirmAction.kind === "approve"
                ? "This marks the submission as approved. You can then proceed with on-chain actions (release, dispute) separately."
                : "This sends feedback to the freelancer and keeps the job in a revision cycle."}
            </p>
            <div className="mt-5 flex justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className={`rounded-lg px-3 py-1.5 ${mutedTextClass}`}
                disabled={isReviewing}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReviewing}
                onClick={async () => {
                  const session = getStoredAuthSession();
                  if (!session) {
                    setError("Please sign in with your wallet first.");
                    setConfirmAction(null);
                    return;
                  }

                  setIsReviewing(true);
                  setError("");
                  try {
                    if (confirmAction.kind === "approve") {
                      await approveDeliverable(session, confirmAction.deliverableId, reviewNote.trim() || undefined);
                    } else {
                      await requestRevision(session, confirmAction.deliverableId, reviewNote.trim() || undefined);
                    }
                    setConfirmAction(null);
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Review action failed.");
                    setConfirmAction(null);
                  } finally {
                    setIsReviewing(false);
                  }
                }}
                className={`rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-60 ${
                  confirmAction.kind === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

