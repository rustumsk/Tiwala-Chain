import { API_BASE_URL } from "@/lib/auth";

export type PublicPostingSummary = {
  id: number;
  employerWallet: string;
  title: string;
  summary: string | null;
  category: string;
  skills: string[];
  jobType: string;
  budgetType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  experienceLevel: string;
  proposalDeadline: string | null;
  publishedAt: string;
};

export type PublicPostingDetail = PublicPostingSummary & {
  description: string | null;
};

export type PublicPostingListResponse = {
  items: PublicPostingSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PublicContractVerificationResponse = {
  status: "Verified" | "NotFound" | "Mismatch" | string;
  matchedHash: string;
  uploadedHash: string | null;
  metadata: {
    title: string;
    jobStatus: string;
    amountUsdt: number;
    recordedAt: string;
    employerWallet: string;
    freelancerWallet: string;
  } | null;
  message: string;
};

export type PublicAiClause = {
  clause: string;
  label: string;
  confidence: number | null;
  reason: string | null;
  suggestion: string | null;
  issue: string | null;
};

export type PublicAiEvaluationResponse = {
  fairnessScore: number;
  clauses: PublicAiClause[];
  totalClauses: number;
  unfairCount: number;
  fairCount: number;
  truncated: boolean;
  cached: boolean;
};

export class PublicRateLimitError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "PublicRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type BrowsePublicPostingsInput = {
  q?: string;
  category?: string;
  experienceLevel?: string;
  jobType?: string;
  budgetMin?: string;
  budgetMax?: string;
  postedWithin?: string;
  skills?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export async function browsePublicPostings(
  input: BrowsePublicPostingsInput = {}
): Promise<PublicPostingListResponse> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/public/postings${suffix}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PublicPostingListResponse;
}

export async function fetchPublicPostingById(
  id: number
): Promise<PublicPostingDetail> {
  const response = await fetch(`${API_BASE_URL}/api/public/postings/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PublicPostingDetail;
}

export async function verifyPublicContract(input: {
  contractHash?: string;
  file?: File | null;
}): Promise<PublicContractVerificationResponse> {
  const formData = new FormData();
  if (input.contractHash?.trim()) {
    formData.set("contractHash", input.contractHash.trim());
  }
  if (input.file) {
    formData.set("file", input.file);
  }

  const response = await fetch(`${API_BASE_URL}/api/public/contracts/verify`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | PublicContractVerificationResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      (payload as { error?: string } | null)?.error ??
        `Request failed (${response.status}).`
    );
  }

  return payload as PublicContractVerificationResponse;
}

export async function evaluatePublicAiReview(
  file: File
): Promise<PublicAiEvaluationResponse> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`${API_BASE_URL}/api/public/ai/evaluate-file`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | PublicAiEvaluationResponse
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    const message =
      (payload as { message?: string; error?: string } | null)?.message ??
      (payload as { message?: string; error?: string } | null)?.error ??
      `Request failed (${response.status}).`;

    if (response.status === 429) {
      const retryAfterRaw = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfterRaw ? Number(retryAfterRaw) : Number.NaN;
      throw new PublicRateLimitError(
        message,
        Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : null
      );
    }

    throw new Error(message);
  }

  return payload as PublicAiEvaluationResponse;
}

export async function evaluatePublicContractText(
  text: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE_URL}/api/public/contracts/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    const message =
      (payload as { message?: string; error?: string } | null)?.message ??
      (payload as { message?: string; error?: string } | null)?.error ??
      `Request failed (${response.status}).`;

    if (response.status === 429) {
      const retryAfterRaw = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfterRaw ? Number(retryAfterRaw) : Number.NaN;
      throw new PublicRateLimitError(
        message,
        Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : null
      );
    }

    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}
