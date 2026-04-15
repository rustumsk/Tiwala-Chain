import { API_BASE_URL, type AuthSession } from "@/lib/auth";
import type { JobResponse, UploadResult } from "@/lib/jobs";

export type ProposalStatus =
  | "Submitted"
  | "Viewed"
  | "Shortlisted"
  | "Rejected"
  | "Withdrawn"
  | "Selected"
  | "ConvertedToOffer"
  | string;

export type ProposalResponse = {
  id: number;
  postingId: number;
  postingTitle: string;
  postingStatus: string;
  employerWallet: string;
  employerDisplayName: string | null;
  freelancerWallet: string;
  freelancerDisplayName: string | null;
  coverLetter: string | null;
  proposedAmount: number;
  estimatedTimeline: string | null;
  portfolioLinks: string[];
  relevantExperience: string | null;
  screeningAnswers: Record<string, string>;
  status: ProposalStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string | null;
  viewedAt: string | null;
  convertedJobId: number | null;
  hasCvAttachment: boolean;
};

export type ProposalMessageResponse = {
  id: number;
  proposalId: number;
  senderWallet: string;
  senderDisplayName: string | null;
  body: string;
  messageType: string;
  createdAt: string;
  readAt: string | null;
};

export type ProposalStatsResponse = {
  activeApplications: number;
  unreadReplies: number;
};

type SaveProposalInput = {
  coverLetter?: string;
  proposedAmount: number;
  estimatedTimeline?: string;
  portfolioLinks?: string[];
  relevantExperience?: string;
  screeningAnswers?: Record<string, string>;
  cvAttachmentKey?: string;
};

export async function uploadProposalCv(
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

export function getProposalCvUrl(
  session: AuthSession,
  proposalId: number
): string {
  return `${API_BASE_URL}/api/proposals/${proposalId}/cv?token=${session.accessToken}`;
}

export async function downloadProposalCv(
  session: AuthSession,
  proposalId: number
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/${proposalId}/cv`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  let fileName = `proposal-${proposalId}-cv`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*)\1/);
    if (match) fileName = match[2];
  }
  const ext = blob.type === "application/pdf" ? ".pdf" : "";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function createProposal(
  session: AuthSession,
  postingId: number,
  input: SaveProposalInput
): Promise<ProposalResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/postings/${postingId}/proposals`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalResponse;
}

export async function fetchPostingProposals(
  session: AuthSession,
  postingId: number
): Promise<ProposalResponse[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/postings/${postingId}/proposals`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalResponse[];
}

export async function fetchMyProposals(
  session: AuthSession
): Promise<ProposalResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/mine`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalResponse[];
}

export async function fetchMyProposalStats(
  session: AuthSession
): Promise<ProposalStatsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/mine/stats`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalStatsResponse;
}

export async function fetchProposalById(
  session: AuthSession,
  id: number
): Promise<ProposalResponse> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/${id}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalResponse;
}

export async function updateProposal(
  session: AuthSession,
  id: number,
  input: Partial<SaveProposalInput>
): Promise<ProposalResponse> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/${id}`, {
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

  return (await response.json()) as ProposalResponse;
}

async function proposalAction(
  session: AuthSession,
  id: number,
  action: "withdraw" | "shortlist" | "reject" | "select"
): Promise<ProposalResponse> {
  const response = await fetch(`${API_BASE_URL}/api/proposals/${id}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalResponse;
}

export function withdrawProposal(session: AuthSession, id: number) {
  return proposalAction(session, id, "withdraw");
}

export function shortlistProposal(session: AuthSession, id: number) {
  return proposalAction(session, id, "shortlist");
}

export function rejectProposal(session: AuthSession, id: number) {
  return proposalAction(session, id, "reject");
}

export function selectProposal(session: AuthSession, id: number) {
  return proposalAction(session, id, "select");
}

export async function fetchProposalMessages(
  session: AuthSession,
  proposalId: number
): Promise<ProposalMessageResponse[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/proposals/${proposalId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalMessageResponse[];
}

export async function sendProposalMessage(
  session: AuthSession,
  proposalId: number,
  body: string
): Promise<ProposalMessageResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/proposals/${proposalId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as ProposalMessageResponse;
}

export async function convertProposalToOffer(
  session: AuthSession,
  id: number,
  input: {
    title?: string;
    description?: string;
    amountUsdt?: number;
    contractKey: string;
    contractHash: string;
  }
): Promise<JobResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/proposals/${id}/convert-to-offer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobResponse;
}
