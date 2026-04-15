import { API_BASE_URL, type AuthSession } from "@/lib/auth";

export type PostingStatus =
  | "Draft"
  | "Published"
  | "Closed"
  | "Filled"
  | "Expired"
  | string;

export type PostingResponse = {
  id: number;
  employerWallet: string;
  employerDisplayName: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  skills: string[];
  jobType: string;
  budgetType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  experienceLevel: string;
  visibility: string;
  proposalDeadline: string | null;
  status: PostingStatus;
  proposalCount: number;
  createdAt: string;
  publishedAt: string | null;
  hasBriefAttachment: boolean;
  screeningQuestions: string[];
};

export type PostingListResponse = {
  items: PostingResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PostingStatsResponse = {
  openPostings: number;
  newProposals: number;
};

type BrowsePostingsInput = {
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

type SavePostingInput = {
  title: string;
  summary?: string;
  description?: string;
  category: string;
  skills: string[];
  jobType?: string;
  budgetType?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeline?: string;
  experienceLevel?: string;
  visibility?: string;
  proposalDeadline?: string | null;
  screeningQuestions?: string[];
  briefAttachmentKey?: string | null;
};

export async function browsePostings(
  input: BrowsePostingsInput = {}
): Promise<PostingListResponse> {
  const params = new URLSearchParams();

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const suffix = params.toString() ? `?${params}` : "";
  const response = await fetch(`${API_BASE_URL}/api/postings${suffix}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingListResponse;
}

export async function fetchPostingById(id: number): Promise<PostingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/postings/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingResponse;
}

export async function fetchMyPostings(
  session: AuthSession
): Promise<PostingResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/postings/mine`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingResponse[];
}

export async function fetchMyPostingStats(
  session: AuthSession
): Promise<PostingStatsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/postings/mine/stats`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingStatsResponse;
}

export async function createPosting(
  session: AuthSession,
  input: SavePostingInput
): Promise<PostingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/postings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingResponse;
}

export async function updatePosting(
  session: AuthSession,
  id: number,
  input: Partial<SavePostingInput>
): Promise<PostingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/postings/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingResponse;
}

async function postStatusAction(
  session: AuthSession,
  id: number,
  action: "publish" | "close" | "reopen"
) {
  const response = await fetch(`${API_BASE_URL}/api/postings/${id}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PostingResponse;
}

export function publishPosting(session: AuthSession, id: number) {
  return postStatusAction(session, id, "publish");
}

export function closePosting(session: AuthSession, id: number) {
  return postStatusAction(session, id, "close");
}

export function reopenPosting(session: AuthSession, id: number) {
  return postStatusAction(session, id, "reopen");
}

export async function deletePosting(session: AuthSession, id: number) {
  const response = await fetch(`${API_BASE_URL}/api/postings/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function downloadPostingBriefBlob(
  session: AuthSession,
  id: number
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/postings/${id}/brief`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.blob();
}
