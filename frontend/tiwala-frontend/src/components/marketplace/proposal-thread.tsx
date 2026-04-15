"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { type AuthSession } from "@/lib/auth";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fetchProposalMessages,
  sendProposalMessage,
  type ProposalMessageResponse,
} from "@/lib/proposals";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

type ProposalThreadProps = {
  proposalId: number;
  session: AuthSession | null;
  currentWallet?: string | null;
  disabled?: boolean;
};

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProposalThread({
  proposalId,
  session,
  currentWallet,
  disabled = false,
}: ProposalThreadProps) {
  const { isDarkTheme, subtlePanelClass, mutedTextClass, tinyLabelClass, titleClass, inputClass } =
    useThemeStyles();
  const [messages, setMessages] = useState<ProposalMessageResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!session) return;
      if (!silent) {
        setIsLoading(true);
        setError("");
      }

      try {
        const next = await fetchProposalMessages(session, proposalId);
        setMessages(next);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load messages.";
        setError(message);
        if (!silent) {
          notifyError(message);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [proposalId, session]
  );

  useEffect(() => {
    void loadMessages(false);
  }, [loadMessages]);

  useVisibleInterval(
    () => void loadMessages(true),
    API_POLL_INTERVAL_MS,
    Boolean(session && proposalId > 0)
  );

  const orderedMessages = useMemo(
    () => [...messages].sort((left, right) => left.id - right.id),
    [messages]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || disabled || !draft.trim()) return;

    setIsSending(true);
    try {
      const created = await sendProposalMessage(session, proposalId, draft.trim());
      setMessages((current) => [...current, created]);
      setDraft("");
      notifySuccess("Message sent.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send message.";
      setError(message);
      notifyError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={`${subtlePanelClass} rounded-2xl p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>
            Proposal thread
          </p>
          <h3 className={`mt-1 text-base font-semibold ${titleClass}`}>
            Employer conversation
          </h3>
        </div>
        <span className={`text-xs ${mutedTextClass}`}>{orderedMessages.length} messages</span>
      </div>

      {error ? (
        <p
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            isDarkTheme
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {error}
        </p>
      ) : null}

      <div
        className={`mt-4 max-h-80 space-y-3 overflow-y-auto rounded-2xl border p-3 ${
          isDarkTheme
            ? "border-white/10 bg-black/20"
            : "border-[#e5e8f2] bg-white"
        }`}
      >
        {isLoading ? (
          <p className={`text-sm ${mutedTextClass}`}>Loading conversation...</p>
        ) : orderedMessages.length === 0 ? (
          <p className={`text-sm ${mutedTextClass}`}>No messages yet.</p>
        ) : (
          orderedMessages.map((message) => {
            const isSystem = message.messageType === "system";
            const isOwn =
              !isSystem &&
              currentWallet &&
              message.senderWallet.toLowerCase() === currentWallet.toLowerCase();

            return (
              <article
                key={message.id}
                className={`rounded-2xl px-3 py-2 ${
                  isSystem
                    ? isDarkTheme
                      ? "border border-white/10 bg-white/[0.04]"
                      : "border border-[#e6e8f1] bg-[#f6f7fb]"
                    : isOwn
                      ? isDarkTheme
                        ? "ml-auto max-w-[88%] bg-violet-500/18 text-white"
                        : "ml-auto max-w-[88%] bg-violet-100 text-violet-900"
                      : isDarkTheme
                        ? "mr-auto max-w-[88%] border border-white/10 bg-black/30 text-white"
                        : "mr-auto max-w-[88%] border border-[#e6e8f1] bg-white text-[#141621]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-xs font-semibold ${isSystem ? mutedTextClass : titleClass}`}>
                    {isSystem
                      ? "System"
                      : message.senderDisplayName || message.senderWallet}
                  </p>
                  <p className={`text-[11px] ${mutedTextClass}`}>
                    {formatMessageTime(message.createdAt)}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {message.body}
                </p>
              </article>
            );
          })
        )}
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <textarea
          className={`${inputClass} min-h-24 py-3`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            disabled
              ? "This proposal thread is closed."
              : "Ask a question or send an update."
          }
          disabled={disabled || !session}
        />
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs ${mutedTextClass}`}>
            Messages stay attached to this proposal until it becomes a formal offer.
          </p>
          <button
            type="submit"
            disabled={disabled || !session || isSending || !draft.trim()}
            className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isDarkTheme
                ? "border border-violet-300/30 bg-violet-500/16 text-violet-100 hover:border-violet-300/50 hover:bg-violet-500/24"
                : "border border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100"
            }`}
          >
            {isSending ? "Sending..." : "Send message"}
          </button>
        </div>
      </form>
    </section>
  );
}
