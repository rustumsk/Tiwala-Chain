"use client";

import { useState } from "react";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
  useConfig,
} from "wagmi";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getStoredAuthSession } from "@/lib/auth";
import {
  DISPUTE_REASON_CODES,
  DISPUTE_REASON_LABELS,
  recordJobDispute,
  type DisputeReasonCode,
} from "@/lib/jobs";
import { tiwalaEscrowAbi, TIWALA_ESCROW_ADDRESS, type EscrowJobStatus } from "@/lib/contract";
import { usdtAbi, USDT_SEPOLIA_ADDRESS } from "@/lib/usdt";

type ActionButtonsProps = {
  jobId: bigint;
  jobAmount: bigint;
  status: EscrowJobStatus;
  canActAsEmployer: boolean;
  canActAsFreelancer: boolean;
  chainOk: boolean;
  mode?: "light" | "dark";
  canSubmitWorkOnChain?: boolean;
  /** Required when "Raise dispute" is available (review stage). */
  contractHash: string;
  onAfterDisputeRecord?: () => void | Promise<void>;
};

type ActionDef = {
  label: string;
  functionName:
    | "depositFunds"
    | "startWork"
    | "submitWork"
    | "releasePayment"
    | "raiseDispute";
};

export default function ActionButtons({
  jobId,
  jobAmount,
  status,
  canActAsEmployer,
  canActAsFreelancer,
  chainOk,
  mode = "dark",
  canSubmitWorkOnChain = true,
  contractHash,
  onAfterDisputeRecord,
}: ActionButtonsProps) {
  const config = useConfig();
  const { address } = useAccount();
  const {
    data: txHash,
    error: txError,
    isPending,
    writeContract,
    writeContractAsync,
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });
  const [localError, setLocalError] = useState("");
  const [localInfo, setLocalInfo] = useState("");
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeReasonCode>("scope_mismatch");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeRetryPayload, setDisputeRetryPayload] = useState<{
    reasonCode: DisputeReasonCode;
    details: string;
  } | null>(null);
  const isDarkTheme = mode === "dark";

  const allowanceQuery = useReadContract({
    address: USDT_SEPOLIA_ADDRESS,
    abi: usdtAbi,
    functionName: "allowance",
    args: address ? [address, TIWALA_ESCROW_ADDRESS] : undefined,
    query: { enabled: Boolean(address && canActAsEmployer) },
  });

  const actions: ActionDef[] = [];
  if (canActAsEmployer && status === 0) {
    actions.push({ label: "Fund Escrow", functionName: "depositFunds" });
  }
  if (canActAsEmployer && status === 1) {
    actions.push({ label: "Start Work", functionName: "startWork" });
  }
  if (canActAsEmployer && status === 3) {
    actions.push({ label: "Release Payment", functionName: "releasePayment" });
    actions.push({ label: "Raise Dispute", functionName: "raiseDispute" });
  }
  if (canActAsFreelancer && status === 2) {
    actions.push({ label: "Submit Work", functionName: "submitWork" });
  }
  if (canActAsFreelancer && status === 3) {
    actions.push({ label: "Raise Dispute", functionName: "raiseDispute" });
  }

  const runAction = async (functionName: ActionDef["functionName"]) => {
    setLocalError("");
    setLocalInfo("");
    if (!chainOk) {
      notifyError("Switch to Sepolia before sending transactions.");
      return;
    }

    try {
      if (functionName === "depositFunds") {
        if (!address) {
          notifyError("Wallet not connected.");
          return;
        }

        const currentAllowance =
          typeof allowanceQuery.data === "bigint" ? allowanceQuery.data : 0n;
        if (currentAllowance < jobAmount) {
          setLocalInfo("Approval required: confirm USDT approve first...");
          const approveHash = await writeContractAsync({
            address: USDT_SEPOLIA_ADDRESS,
            abi: usdtAbi,
            functionName: "approve",
            args: [TIWALA_ESCROW_ADDRESS, jobAmount],
          });
          setLocalInfo("Waiting for approval confirmation...");
          await waitForTransactionReceipt(config, { hash: approveHash });
          setLocalInfo("Approval confirmed. Preparing deposit transaction...");
        }
      }

      writeContract({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName,
        args: [jobId],
      });
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : "Unable to send transaction."
      );
    }
  };

  const submitDisputeMetadata = async (reasonCode: DisputeReasonCode, details: string) => {
    const session = getStoredAuthSession();
    if (
      !session ||
      !address ||
      session.walletAddress.toLowerCase() !== address.toLowerCase()
    ) {
      notifyError("Please sign in with your wallet first.");
      return false;
    }
    await recordJobDispute(session, {
      contractHash,
      onChainJobId: jobId.toString(),
      reasonCode,
      details: details.trim() || undefined,
    });
    return true;
  };

  const confirmRaiseDispute = async () => {
    if (!chainOk) {
      notifyError("Switch to Sepolia before sending transactions.");
      return;
    }
    if (!address) {
      notifyError("Wallet not connected.");
      return;
    }
    setDisputeBusy(true);
    try {
      const hash = await writeContractAsync({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "raiseDispute",
        args: [jobId],
      });
      await waitForTransactionReceipt(config, { hash });
      try {
        await submitDisputeMetadata(disputeReason, disputeDetails);
        setDisputeRetryPayload(null);
        notifySuccess("Dispute raised. Your summary was saved for the moderator.");
        setDisputeModalOpen(false);
        await onAfterDisputeRecord?.();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not save dispute summary.";
        notifyError(msg);
        setDisputeRetryPayload({
          reasonCode: disputeReason,
          details: disputeDetails,
        });
      }
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Unable to raise dispute on-chain."
      );
    } finally {
      setDisputeBusy(false);
    }
  };

  const retryDisputeMetadata = async () => {
    if (!disputeRetryPayload) return;
    setDisputeBusy(true);
    try {
      const ok = await submitDisputeMetadata(
        disputeRetryPayload.reasonCode,
        disputeRetryPayload.details
      );
      if (ok) {
        setDisputeRetryPayload(null);
        notifySuccess("Dispute summary saved.");
        await onAfterDisputeRecord?.();
      }
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Could not save dispute summary."
      );
    } finally {
      setDisputeBusy(false);
    }
  };

  const selectClass = isDarkTheme
    ? "mt-2 w-full rounded-lg border border-white/14 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
    : "mt-2 w-full rounded-lg border border-[#e1e4f0] bg-white px-3 py-2 text-sm text-[#11131b] outline-none focus:border-violet-400";
  const textareaClass = isDarkTheme
    ? "mt-2 w-full rounded-lg border border-white/14 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50 placeholder:text-white/35"
    : "mt-2 w-full rounded-lg border border-[#e1e4f0] bg-white px-3 py-2 text-sm text-[#11131b] outline-none focus:border-violet-400 placeholder:text-[#73788b]";

  return (
    <div
      className={`border p-5 ${
        isDarkTheme
          ? "border-white/12 bg-black/28"
          : "border-[#e4e8f2] bg-white shadow-[0_10px_26px_rgba(40,50,90,0.06)]"
      }`}
    >
      <h3
        className={`text-sm font-semibold uppercase tracking-[0.15em] ${
          isDarkTheme ? "text-slate-300" : "text-[#6b7185]"
        }`}
      >
        Available Actions
      </h3>

      {disputeRetryPayload ? (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-amber-400/35 bg-amber-500/10 text-amber-100"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p>
            The dispute was recorded on-chain, but saving your summary to the server failed. You can
            retry without sending another transaction.
          </p>
          <button
            type="button"
            disabled={disputeBusy}
            onClick={() => void retryDisputeMetadata()}
            className={`mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold ${
              isDarkTheme
                ? "border-violet-300/40 bg-violet-500/15 text-violet-100"
                : "border-violet-300 bg-violet-50 text-violet-800"
            }`}
          >
            {disputeBusy ? "Saving…" : "Retry save summary"}
          </button>
        </div>
      ) : null}

      {actions.length === 0 ? (
        <p className={`mt-3 text-sm ${isDarkTheme ? "text-slate-400" : "text-[#697086]"}`}>
          No available actions for your role at this status.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {actions.map((action) => {
            const disabled =
              isPending ||
              receipt.isLoading ||
              (action.functionName === "submitWork" && !canSubmitWorkOnChain);
            if (action.functionName === "raiseDispute") {
              return (
                <button
                  className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                    isDarkTheme
                      ? "border-red-400/35 bg-red-500/10 text-red-100 hover:border-red-400/55 hover:bg-red-500/18"
                      : "border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100"
                  }`}
                  disabled={disabled || disputeBusy}
                  key="raise-dispute"
                  onClick={() => setDisputeModalOpen(true)}
                  type="button"
                >
                  {action.label}
                </button>
              );
            }
            return (
              <button
                className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                  isDarkTheme
                    ? "border-violet-300/30 bg-violet-500/10 text-violet-200 hover:border-violet-300/60 hover:bg-violet-500/20"
                    : "border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
                }`}
                disabled={disabled}
                key={`${action.functionName}-${action.label}`}
                onClick={() => void runAction(action.functionName)}
                type="button"
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {localError ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {localError}
        </p>
      ) : null}

      {localInfo ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-violet-300/30 bg-violet-500/10 text-violet-200"
              : "border-violet-200 bg-violet-50 text-violet-700"
          }`}
        >
          {localInfo}
        </p>
      ) : null}

      {txError ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          Transaction error: {txError.message}
        </p>
      ) : null}

      {txHash ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-violet-300/30 bg-violet-500/10 text-violet-200"
              : "border-violet-200 bg-violet-50 text-violet-700"
          }`}
        >
          Transaction sent: {txHash}
        </p>
      ) : null}

      {receipt.isLoading ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-slate-700 bg-slate-900 text-slate-300"
              : "border-[#d8dceb] bg-[#f8f9fc] text-[#697086]"
          }`}
        >
          Waiting for confirmation...
        </p>
      ) : null}

      {receipt.isSuccess ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            isDarkTheme
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          Transaction confirmed.
        </p>
      ) : null}

      {disputeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${
              isDarkTheme
                ? "border-white/12 bg-[#0b0f1a]"
                : "border-[#e6e8f1] bg-white"
            }`}
          >
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                isDarkTheme ? "text-red-300/90" : "text-red-600"
              }`}
            >
              Raise dispute
            </p>
            <h4 className={`mt-2 text-lg font-semibold ${isDarkTheme ? "text-white" : "text-[#11131b]"}`}>
              Tell the moderator what went wrong
            </h4>
            <p className={`mt-2 text-sm ${isDarkTheme ? "text-white/60" : "text-[#5c6172]"}`}>
              This summary is stored off-chain. Only the contract state is written to the blockchain
              when you confirm.
            </p>

            <label className={`mt-4 block text-xs font-medium ${isDarkTheme ? "text-white/80" : "text-[#2a3040]"}`}>
              Reason
            </label>
            <select
              className={selectClass}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value as DisputeReasonCode)}
            >
              {DISPUTE_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {DISPUTE_REASON_LABELS[code]}
                </option>
              ))}
            </select>

            <label className={`mt-4 block text-xs font-medium ${isDarkTheme ? "text-white/80" : "text-[#2a3040]"}`}>
              Additional details (optional)
            </label>
            <textarea
              className={textareaClass}
              maxLength={2000}
              rows={4}
              value={disputeDetails}
              onChange={(e) => setDisputeDetails(e.target.value)}
              placeholder="Brief facts the moderator should know (max 2000 characters)."
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={disputeBusy}
                onClick={() => setDisputeModalOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm ${isDarkTheme ? "text-white/60" : "text-[#5c6172]"}`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disputeBusy}
                onClick={() => void confirmRaiseDispute()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {disputeBusy ? "Working…" : "Confirm & raise dispute"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
