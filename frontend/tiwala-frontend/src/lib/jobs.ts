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

