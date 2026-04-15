import { API_BASE_URL, type AuthSession } from "@/lib/auth";

export type NotificationResponse = {
  id: number;
  type: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

export type UnreadNotificationCountResponse = {
  count: number;
};

export async function fetchNotifications(
  session: AuthSession,
  limit = 25
): Promise<NotificationResponse[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/notifications?limit=${limit}`,
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

  return (await response.json()) as NotificationResponse[];
}

export async function fetchUnreadNotificationCount(
  session: AuthSession
): Promise<UnreadNotificationCountResponse> {
  const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as UnreadNotificationCountResponse;
}

export async function markNotificationRead(
  session: AuthSession,
  id: number
): Promise<NotificationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as NotificationResponse;
}

export async function markAllNotificationsRead(
  session: AuthSession
): Promise<UnreadNotificationCountResponse> {
  const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as UnreadNotificationCountResponse;
}
