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
import { notifyError } from "@/lib/notify";
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
  // When provided, controls whether the freelancer can actually submit work on-chain.
  // Defaults to true so existing callers are unaffected.
  canSubmitWorkOnChain?: boolean;
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
            return (
            <button
              className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${
                isDarkTheme
                  ? "border-violet-300/30 bg-violet-500/10 text-violet-200 hover:border-violet-300/60 hover:bg-violet-500/20"
                  : "border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
              }`}
              disabled={disabled}
              key={`${action.functionName}-${action.label}`}
              onClick={() => runAction(action.functionName)}
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
    </div>
  );
}
