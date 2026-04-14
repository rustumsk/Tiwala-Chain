"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  TIWALA_ESCROW_ADDRESS,
  tiwalaEscrowAbi,
  type EscrowJobStatus,
} from "@/lib/contract";
import { getStoredAuthSession } from "@/lib/auth";
import {
  fetchIncomingOffers,
  fetchSentOffers,
  normalizeContractHashForApi,
  type JobResponse,
} from "@/lib/jobs";
import { escrowLiveQueryOptions } from "@/lib/realtime";
import type { EscrowJob } from "@/types";
import type { Address, Hex } from "viem";

function normalizeBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  return null;
}

function normalizeStatus(value: unknown): EscrowJobStatus | null {
  const asNumber =
    typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(asNumber) || asNumber < 0 || asNumber > 6) return null;
  return asNumber as EscrowJobStatus;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function parseJobResult(id: bigint, result: unknown): EscrowJob | null {
  let employer: unknown;
  let freelancer: unknown;
  let amount: unknown;
  let status: unknown;
  let contractHash: unknown;
  let createdAt: unknown;

  if (Array.isArray(result)) {
    if (result.length < 6) return null;
    [employer, freelancer, amount, status, contractHash, createdAt] = result;
  } else {
    const record = asRecord(result);
    if (!record) return null;
    employer = record.employer;
    freelancer = record.freelancer;
    amount = record.amount;
    status = record.status;
    contractHash = record.contractHash;
    createdAt = record.createdAt;
  }

  const normalizedAmount = normalizeBigInt(amount);
  const normalizedStatus = normalizeStatus(status);
  const normalizedCreatedAt = normalizeBigInt(createdAt);

  if (
    typeof employer !== "string" ||
    typeof freelancer !== "string" ||
    typeof contractHash !== "string" ||
    normalizedAmount === null ||
    normalizedStatus === null ||
    normalizedCreatedAt === null
  ) {
    return null;
  }

  return {
    id,
    employer: employer as Address,
    freelancer: freelancer as Address,
    amount: normalizedAmount,
    contractHash: contractHash as Hex,
    status: normalizedStatus,
    createdAt: normalizedCreatedAt,
  };
}

type UseEscrowJobsParams = {
  walletAddress?: Address;
  enabled?: boolean;
};

function mergeJobMetadata(
  jobs: EscrowJob[],
  metadataMap: Map<string, JobResponse>
): EscrowJob[] {
  return jobs.map((job) => {
    const metadata = metadataMap.get(
      normalizeContractHashForApi(job.contractHash)
    );
    if (!metadata) return job;
    return {
      ...job,
      title: metadata.title,
      description: metadata.description,
      offChainId: metadata.id,
    };
  });
}

export function useEmployerJobs({ walletAddress, enabled }: UseEscrowJobsParams) {
  const idsQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "getEmployerJobs",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: Boolean(enabled && walletAddress),
      ...escrowLiveQueryOptions,
    },
  });

  const jobIds = useMemo(
    () =>
      Array.isArray(idsQuery.data)
        ? (idsQuery.data
            .map((value) => normalizeBigInt(value))
            .filter((value): value is bigint => value !== null) as bigint[])
        : [],
    [idsQuery.data]
  );

  const contracts = useMemo(
    () =>
      jobIds.map((jobId) => ({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "getJob" as const,
        args: [jobId] as const,
      })),
    [jobIds]
  );

  const jobsQuery = useReadContracts({
    contracts,
    query: {
      enabled: Boolean(enabled && contracts.length > 0),
      ...escrowLiveQueryOptions,
    },
    allowFailure: true,
  });

  const jobs = useMemo(() => {
    if (!jobsQuery.data) return [];

    return jobsQuery.data
      .map((entry, index) => {
        if (entry.status !== "success") return null;
        return parseJobResult(jobIds[index], entry.result);
      })
      .filter((job): job is EscrowJob => Boolean(job));
  }, [jobIds, jobsQuery.data]);

  const [metadataMap, setMetadataMap] = useState<Map<string, JobResponse>>(
    () => new Map()
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!enabled || !walletAddress) {
        if (!cancelled) setMetadataMap(new Map());
        return;
      }

      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
      ) {
        if (!cancelled) setMetadataMap(new Map());
        return;
      }

      try {
        const offers = await fetchSentOffers(session);
        if (cancelled) return;
        const map = new Map<string, JobResponse>();
        offers.forEach((offer) => {
          map.set(normalizeContractHashForApi(offer.contractHash), offer);
        });
        setMetadataMap(map);
      } catch {
        if (!cancelled) setMetadataMap(new Map());
      }
    }

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [enabled, walletAddress]);

  return {
    jobIds,
    jobs: mergeJobMetadata(jobs, metadataMap),
    isLoading: idsQuery.isLoading || jobsQuery.isLoading,
    isError: idsQuery.isError || jobsQuery.isError,
  };
}

export function useFreelancerJobs({
  walletAddress,
  enabled,
}: UseEscrowJobsParams) {
  const idsQuery = useReadContract({
    address: TIWALA_ESCROW_ADDRESS,
    abi: tiwalaEscrowAbi,
    functionName: "getFreelancerJobs",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: Boolean(enabled && walletAddress),
      ...escrowLiveQueryOptions,
    },
  });

  const jobIds = useMemo(
    () =>
      Array.isArray(idsQuery.data)
        ? (idsQuery.data
            .map((value) => normalizeBigInt(value))
            .filter((value): value is bigint => value !== null) as bigint[])
        : [],
    [idsQuery.data]
  );

  const contracts = useMemo(
    () =>
      jobIds.map((jobId) => ({
        address: TIWALA_ESCROW_ADDRESS,
        abi: tiwalaEscrowAbi,
        functionName: "getJob" as const,
        args: [jobId] as const,
      })),
    [jobIds]
  );

  const jobsQuery = useReadContracts({
    contracts,
    query: {
      enabled: Boolean(enabled && contracts.length > 0),
      ...escrowLiveQueryOptions,
    },
    allowFailure: true,
  });

  const jobs = useMemo(() => {
    if (!jobsQuery.data) return [];

    return jobsQuery.data
      .map((entry, index) => {
        if (entry.status !== "success") return null;
        return parseJobResult(jobIds[index], entry.result);
      })
      .filter((job): job is EscrowJob => Boolean(job));
  }, [jobIds, jobsQuery.data]);

  const [metadataMap, setMetadataMap] = useState<Map<string, JobResponse>>(
    () => new Map()
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!enabled || !walletAddress) {
        if (!cancelled) setMetadataMap(new Map());
        return;
      }

      const session = getStoredAuthSession();
      if (
        !session ||
        session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
      ) {
        if (!cancelled) setMetadataMap(new Map());
        return;
      }

      try {
        const offers = await fetchIncomingOffers(session);
        if (cancelled) return;
        const map = new Map<string, JobResponse>();
        offers.forEach((offer) => {
          map.set(normalizeContractHashForApi(offer.contractHash), offer);
        });
        setMetadataMap(map);
      } catch {
        if (!cancelled) setMetadataMap(new Map());
      }
    }

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [enabled, walletAddress]);

  return {
    jobIds,
    jobs: mergeJobMetadata(jobs, metadataMap),
    isLoading: idsQuery.isLoading || jobsQuery.isLoading,
    isError: idsQuery.isError || jobsQuery.isError,
  };
}
