"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { formatUnits, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import {
  tiwalaEscrowAbi,
  TIWALA_ESCROW_ADDRESS,
} from "@/lib/contract";

type TransactionEventLogProps = {
  jobId: bigint;
  mode?: "light" | "dark";
  refreshKey?: number;
};

type EventName =
  | "JobCreated"
  | "JobFunded"
  | "WorkSubmitted"
  | "PaymentReleased"
  | "PaymentRefunded"
  | "DisputeRaised"
  | "DisputeResolved";

type ChainLog = {
  eventName: EventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
};

type LogRow = {
  id: string;
  title: string;
  detail: string;
  actorLabel: string;
  actor?: string;
  amount?: bigint;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  timestamp?: number;
};

const EVENT_NAMES: EventName[] = [
  "JobCreated",
  "JobFunded",
  "WorkSubmitted",
  "PaymentReleased",
  "PaymentRefunded",
  "DisputeRaised",
  "DisputeResolved",
];

const ZERO_BLOCK = BigInt(0);
const LOG_BLOCK_RANGE = BigInt(9_000);
const MAX_JOB_CREATED_LOOKBACK_BLOCKS = BigInt(800_000);

function shortHash(value: string) {
  return value.length < 14 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function shortAddress(value?: string) {
  if (!value) return "Unknown";
  return value.length < 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUsdt(value?: bigint) {
  if (typeof value !== "bigint") return null;
  return Number(formatUnits(value, 6)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function asAddress(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBigInt(value: unknown): bigint | undefined {
  return typeof value === "bigint" ? value : undefined;
}

function toRow(log: ChainLog, timestamp?: number): LogRow {
  const amount = asBigInt(log.args.amount);

  switch (log.eventName) {
    case "JobCreated":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Job created",
        detail: "Escrow job opened on-chain.",
        actorLabel: "Employer",
        actor: asAddress(log.args.employer),
        amount,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "JobFunded":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Escrow funded",
        detail: "Employer deposited funds into escrow.",
        actorLabel: "Employer",
        actor: asAddress(log.args.employer),
        amount,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "WorkSubmitted":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Work submitted",
        detail: "Freelancer marked the work as submitted on-chain.",
        actorLabel: "Freelancer",
        actor: asAddress(log.args.freelancer),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "PaymentReleased":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Payment released",
        detail: "Escrow funds were released to the freelancer.",
        actorLabel: "Freelancer",
        actor: asAddress(log.args.freelancer),
        amount,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "PaymentRefunded":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Payment refunded",
        detail: "Escrow funds were refunded to the employer.",
        actorLabel: "Employer",
        actor: asAddress(log.args.employer),
        amount,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "DisputeRaised":
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Dispute raised",
        detail: "A job participant raised a dispute.",
        actorLabel: "Raised by",
        actor: asAddress(log.args.raisedBy),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    case "DisputeResolved": {
      const releasedToFreelancer = log.args.releasedToFreelancer === true;
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        title: "Dispute resolved",
        detail: releasedToFreelancer
          ? "Moderator resolved the dispute in favor of the freelancer."
          : "Moderator resolved the dispute with a refund to the employer.",
        actorLabel: "Moderator",
        actor: asAddress(log.args.resolvedBy),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
        timestamp,
      };
    }
  }
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

export default function TransactionEventLog({
  jobId,
  mode = "dark",
  refreshKey = 0,
}: TransactionEventLogProps) {
  const publicClient = usePublicClient({ chainId: 11155111 });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const isDarkTheme = mode === "dark";

  const loadLogs = useCallback(async () => {
    if (!publicClient) {
      setRows([]);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const oldestSearchBlock =
        latestBlock > MAX_JOB_CREATED_LOOKBACK_BLOCKS
          ? latestBlock - MAX_JOB_CREATED_LOOKBACK_BLOCKS
          : ZERO_BLOCK;
      let createdAtBlock: bigint | null = null;
      let searchToBlock = latestBlock;

      while (searchToBlock >= oldestSearchBlock && createdAtBlock === null) {
        const searchFromBlock =
          searchToBlock > LOG_BLOCK_RANGE
            ? searchToBlock - LOG_BLOCK_RANGE + BigInt(1)
            : ZERO_BLOCK;
        const fromBlock =
          searchFromBlock < oldestSearchBlock
            ? oldestSearchBlock
            : searchFromBlock;
        const createdLogs = await publicClient.getContractEvents({
          address: TIWALA_ESCROW_ADDRESS,
          abi: tiwalaEscrowAbi,
          eventName: "JobCreated",
          args: { jobId },
          fromBlock,
          toBlock: searchToBlock,
        });

        if (createdLogs.length > 0) {
          createdAtBlock = createdLogs[0].blockNumber;
          break;
        }

        if (fromBlock === ZERO_BLOCK || fromBlock === oldestSearchBlock) {
          break;
        }
        searchToBlock = fromBlock - BigInt(1);
      }

      if (createdAtBlock === null) {
        setRows([]);
        return;
      }

      const eventLogs: ChainLog[] = [];
      let fromBlock = createdAtBlock;
      while (fromBlock <= latestBlock) {
        const toBlock = minBigInt(fromBlock + LOG_BLOCK_RANGE - BigInt(1), latestBlock);
        const chunkLogs = await Promise.all(
          EVENT_NAMES.map(async (eventName) => {
            const logs = await publicClient.getContractEvents({
              address: TIWALA_ESCROW_ADDRESS,
              abi: tiwalaEscrowAbi,
              eventName,
              args: { jobId },
              fromBlock,
              toBlock,
            });
            return logs.map((log) => ({
              eventName: log.eventName as EventName,
              args: log.args as Record<string, unknown>,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              transactionHash: log.transactionHash,
            }));
          })
        );
        eventLogs.push(...chunkLogs.flat());
        fromBlock = toBlock + BigInt(1);
      }

      eventLogs.sort((a, b) => {
        if (a.blockNumber === b.blockNumber) return a.logIndex - b.logIndex;
        return a.blockNumber < b.blockNumber ? -1 : 1;
      });

      const blockNumbers = [...new Set(eventLogs.map((log) => log.blockNumber))];
      const timestamps = new Map<bigint, number>();
      await Promise.all(
        blockNumbers.map(async (blockNumber) => {
          const block = await publicClient.getBlock({ blockNumber });
          timestamps.set(blockNumber, Number(block.timestamp));
        })
      );

      setRows(
        eventLogs.map((log) => toRow(log, timestamps.get(log.blockNumber)))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load blockchain transaction history."
      );
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, publicClient]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs, refreshKey]);

  const classes = useMemo(
    () => ({
      panel: isDarkTheme
        ? "border-white/12 bg-black/28"
        : "border-[#e4e8f2] bg-white shadow-[0_10px_26px_rgba(40,50,90,0.06)]",
      row: isDarkTheme
        ? "border-white/10 bg-white/[0.03]"
        : "border-[#e8ebf3] bg-[#fafbff]",
      title: isDarkTheme ? "text-white" : "text-[#11131b]",
      muted: isDarkTheme ? "text-white/58" : "text-[#5c6172]",
      tiny: isDarkTheme ? "text-white/42" : "text-[#73788b]",
      chip: isDarkTheme
        ? "border-violet-300/30 bg-violet-500/10 text-violet-100"
        : "border-violet-200 bg-violet-50 text-violet-800",
    }),
    [isDarkTheme]
  );

  return (
    <article className={`rounded-2xl border p-6 lg:p-8 ${classes.panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] uppercase tracking-[0.18em] ${classes.tiny}`}>
            Blockchain activity
          </p>
          <h2 className={`mt-1.5 text-lg font-bold tracking-tight ${classes.title}`}>
            Transaction log
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={isLoading}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition disabled:opacity-60 ${classes.chip}`}
        >
          <RotateCcw size={14} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <p className={`mt-4 text-sm ${classes.muted}`}>Loading transaction history...</p>
      ) : null}

      {error ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            isDarkTheme
              ? "border-red-400/25 bg-red-500/10 text-red-200"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {error}
        </div>
      ) : null}

      {!isLoading && !error && rows.length === 0 ? (
        <p className={`mt-4 text-sm ${classes.muted}`}>
          No blockchain transactions have been found for this job yet.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const amount = formatUsdt(row.amount);
            return (
              <div key={row.id} className={`rounded-xl border p-4 ${classes.row}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${classes.title}`}>
                      {row.title}
                    </p>
                    <p className={`mt-1 text-sm ${classes.muted}`}>{row.detail}</p>
                  </div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${row.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${classes.chip}`}
                  >
                    Etherscan
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${classes.tiny}`}>
                      {row.actorLabel}
                    </p>
                    <p className={`mt-1 font-mono text-xs ${classes.title}`}>
                      {shortAddress(row.actor)}
                    </p>
                  </div>
                  {amount ? (
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${classes.tiny}`}>
                        Amount
                      </p>
                      <p className={`mt-1 text-xs font-semibold ${classes.title}`}>
                        {amount} USDT
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${classes.tiny}`}>
                      Transaction
                    </p>
                    <p className={`mt-1 font-mono text-xs ${classes.title}`}>
                      {shortHash(row.transactionHash)}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.14em] ${classes.tiny}`}>
                      Time
                    </p>
                    <p className={`mt-1 text-xs ${classes.muted}`}>
                      {row.timestamp
                        ? new Date(row.timestamp * 1000).toLocaleString()
                        : `Block ${row.blockNumber.toString()}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
