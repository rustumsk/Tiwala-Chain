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
import { tiwalaEscrowAbi, TIWALA_ESCROW_ADDRESS, type EscrowJobStatus } from "@/lib/contract";
import { usdtAbi, USDT_SEPOLIA_ADDRESS } from "@/lib/usdt";

type ActionButtonsProps = {
  jobId: bigint;
  jobAmount: bigint;
  status: EscrowJobStatus;
  canActAsEmployer: boolean;
  canActAsFreelancer: boolean;
  chainOk: boolean;
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
      setLocalError("Switch to Sepolia before sending transactions.");
      return;
    }

    try {
      if (functionName === "depositFunds") {
        if (!address) {
          setLocalError("Wallet not connected.");
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
      setLocalError(
        error instanceof Error ? error.message : "Unable to send transaction."
      );
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-300">
        Available Actions
      </h3>

      {actions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No available actions for your role at this status.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {actions.map((action) => (
            <button
              className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-60"
              disabled={isPending || receipt.isLoading}
              key={`${action.functionName}-${action.label}`}
              onClick={() => runAction(action.functionName)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {localError ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {localError}
        </p>
      ) : null}

      {localInfo ? (
        <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
          {localInfo}
        </p>
      ) : null}

      {txError ? (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          Transaction error: {txError.message}
        </p>
      ) : null}

      {txHash ? (
        <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
          Transaction sent: {txHash}
        </p>
      ) : null}

      {receipt.isLoading ? (
        <p className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          Waiting for confirmation...
        </p>
      ) : null}

      {receipt.isSuccess ? (
        <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Transaction confirmed.
        </p>
      ) : null}
    </div>
  );
}
