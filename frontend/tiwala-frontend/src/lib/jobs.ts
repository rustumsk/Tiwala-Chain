import { API_BASE_URL, type AuthSession } from "@/lib/auth";

export type JobStatus = "PendingOffer" | "Accepted" | "Declined" | "Cancelled";

export type JobResponse = {
  id: number;
  employerWallet: string;
  freelancerWallet: string;
  title: string;
  description: string | null;
  status: JobStatus | string;
   amountUsdt: number;
  contractKey: string;
  contractHash: string;
  createdAt: string;
  updatedAt: string | null;
};

export type UploadResult = {
  fileName: string;
  contentType: string;
  length: number;
  key: string;
  hash: string;
};

export async function uploadJobContract(
  session: AuthSession,
  file: File
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as UploadResult;
}

export async function createJobOffer(
  session: AuthSession,
  payload: {
    freelancerWallet: string;
    title: string;
    description: string;
    amountUsdt: string;
    contractKey: string;
    contractHash: string;
  }
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

export async function fetchIncomingOffers(
  session: AuthSession
): Promise<JobResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/offers/incoming`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse[];
}

export async function fetchSentOffers(
  session: AuthSession
): Promise<JobResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/offers/sent`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse[];
}

export async function fetchJobById(
  session: AuthSession,
  id: number
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${id}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

export async function fetchJobByHash(
  session: AuthSession,
  contractHash: string
): Promise<JobResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/jobs/by-hash/${encodeURIComponent(contractHash)}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

export async function syncJobFromChain(
  session: AuthSession,
  payload: {
    onChainJobId: string;
    employerWallet: string;
    freelancerWallet: string;
    amountUsdt: number;
    contractHash: string;
    title?: string;
    description?: string | null;
  }
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/sync-from-chain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

export async function downloadJobContractBlob(
  session: AuthSession,
  id: number
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${id}/contract`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.blob();
}

export async function downloadJobContractByHashBlob(
  session: AuthSession,
  contractHash: string
): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/jobs/contract/by-hash/${encodeURIComponent(contractHash)}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.blob();
}

export async function acceptJobOffer(
  session: AuthSession,
  id: number
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${id}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

export async function declineJobOffer(
  session: AuthSession,
  id: number
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${id}/decline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}

/** Lowercase hex, no `0x`, for API paths and dispute payloads. */
export function normalizeContractHashForApi(hash: string): string {
  const t = hash.trim().toLowerCase();
  return t.startsWith("0x") ? t.slice(2) : t;
}

export const DISPUTE_REASON_CODES = [
  "scope_mismatch",
  "quality",
  "late_or_no_delivery",
  "communication",
  "other",
] as const;

export type DisputeReasonCode = (typeof DISPUTE_REASON_CODES)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReasonCode, string> = {
  scope_mismatch: "Scope or requirements mismatch",
  quality: "Quality of work",
  late_or_no_delivery: "Late or missing delivery",
  communication: "Communication or collaboration",
  other: "Other",
};

export type JobDisputeResponse = {
  contractHash: string;
  onChainJobId: string;
  raisedByWallet: string;
  reasonCode: string;
  reasonLabel: string;
  details: string | null;
  createdAt: string;
};

export async function fetchJobDisputeByHash(
  session: AuthSession,
  contractHash: string
): Promise<JobDisputeResponse | null> {
  const h = normalizeContractHashForApi(contractHash);
  const response = await fetch(
    `${API_BASE_URL}/api/jobs/disputes/by-hash/${encodeURIComponent(h)}`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as JobDisputeResponse;
}

export async function recordJobDispute(
  session: AuthSession,
  body: {
    contractHash: string;
    onChainJobId: string;
    reasonCode: DisputeReasonCode;
    details?: string;
  }
): Promise<JobDisputeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/disputes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      contractHash: normalizeContractHashForApi(body.contractHash),
      onChainJobId: body.onChainJobId,
      reasonCode: body.reasonCode,
      details: body.details?.trim() || undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as JobDisputeResponse;
}

