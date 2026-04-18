import { API_BASE_URL, type AuthSession } from "@/lib/auth";

export type DeliverableAttachment = {
  id: number;
  type: "Link" | "File" | string;
  url: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
};

export type Deliverable = {
  id: number;
  jobId: number;
  note: string | null;
  status: "PendingReview" | "Approved" | "RevisionRequested" | string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string | null;
  attachments: DeliverableAttachment[];
};

export async function listDeliverablesByHash(
  session: AuthSession,
  contractHash: string
): Promise<Deliverable[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/deliverables/by-hash/${encodeURIComponent(contractHash)}`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Deliverable[];
}

export async function submitDeliverableByHash(input: {
  session: AuthSession;
  contractHash: string;
  note?: string;
  links: string[];
  files: File[];
  deliverableId?: number;
}): Promise<Deliverable> {
  const formData = new FormData();
  if (input.note) formData.append("note", input.note);
  if (typeof input.deliverableId === "number") {
    formData.append("deliverableId", String(input.deliverableId));
  }
  formData.append("linksJson", JSON.stringify(input.links));
  input.files.forEach((file) => formData.append("files", file));

  const response = await fetch(
    `${API_BASE_URL}/api/deliverables/by-hash/${encodeURIComponent(input.contractHash)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${input.session.accessToken}` },
      body: formData,
    }
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Deliverable;
}

export async function approveDeliverable(
  session: AuthSession,
  deliverableId: number,
  note?: string
): Promise<Deliverable> {
  const response = await fetch(
    `${API_BASE_URL}/api/deliverables/${deliverableId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ note: note ?? null }),
    }
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Deliverable;
}

export async function requestRevision(
  session: AuthSession,
  deliverableId: number,
  note?: string
): Promise<Deliverable> {
  const response = await fetch(
    `${API_BASE_URL}/api/deliverables/${deliverableId}/request-revision`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ note: note ?? null }),
    }
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Deliverable;
}

export async function downloadDeliverableAttachmentBlob(
  session: AuthSession,
  attachmentId: number
): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/deliverables/files/${attachmentId}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
  );
  if (!response.ok) throw new Error(await response.text());
  return await response.blob();
}

export function prettyBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

