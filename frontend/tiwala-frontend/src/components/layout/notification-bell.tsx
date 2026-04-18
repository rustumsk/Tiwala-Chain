"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { getStoredAuthSession } from "@/lib/auth";
import { MARKETPLACE_NOTIFICATION_LABELS } from "@/lib/marketplace-constants";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationResponse,
} from "@/lib/notifications";
import type { LocalUserProfile } from "@/lib/profile";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

type NotificationBellProps = {
  address?: string;
  profile: LocalUserProfile | null;
  isDarkTheme: boolean;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationBell({
  address,
  profile,
  isDarkTheme,
}: NotificationBellProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const session = getStoredAuthSession();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!session || !address || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      const [items, unread] = await Promise.all([
        fetchNotifications(session, 12),
        fetchUnreadNotificationCount(session),
      ]);
      setNotifications(items);
      setUnreadCount(unread.count);
    } catch {
      // keep the shell quiet if polling fails
    }
  }, [address, session]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadNotifications]);

  useVisibleInterval(
    () => void loadNotifications(),
    API_POLL_INTERVAL_MS,
    Boolean(session && address)
  );

  useEffect(() => {
    if (!open) return;

    const onClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const buttonClass = isDarkTheme
    ? "border-white/15 bg-white/[0.04] text-white/80 hover:border-violet-300/35 hover:bg-violet-500/12"
    : "border-[#dde1ec] bg-white text-[#363c4e] hover:border-violet-300 hover:bg-violet-50";

  const dropdownClass = isDarkTheme
    ? "border-white/[0.08] bg-[#0e1320] text-white"
    : "border-[#e4e7f1] bg-white text-[#171a24]";

  const mutedTextClass = isDarkTheme ? "text-white/45" : "text-[#7b8196]";
  const labelClass = isDarkTheme ? "text-white/82" : "text-[#171a24]";

  const handleOpenNotification = async (notification: NotificationResponse) => {
    if (!session) return;

    if (!notification.isRead) {
      try {
        await markNotificationRead(session, notification.id);
      } catch {
        // no-op
      }
    }

    const data = notification.data ?? {};
    const jobId = Number(data.jobId ?? "");
    const postingId = Number(data.postingId ?? "");
    const offerTypes = new Set([
      "offer_sent",
      "offer_from_proposal",
      "offer_accepted",
      "offer_declined",
    ]);
    const employerTypes = new Set([
      "proposal_received",
      "proposal_withdrawn",
    ]);

    if (offerTypes.has(notification.type)) {
      router.push(Number.isFinite(jobId) && jobId > 0 ? `/offers/${jobId}` : "/offers");
    } else if (Number.isFinite(postingId) && postingId > 0) {
      if (
        profile?.role === "employer" ||
        (profile?.role === "both" && employerTypes.has(notification.type))
      ) {
        router.push(`/postings/${postingId}/proposals`);
      } else {
        router.push(`/postings/${postingId}`);
      }
    }

    setOpen(false);
    void loadNotifications();
  };

  const hasNotifications = notifications.length > 0;
  const unreadBadge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex size-10 items-center justify-center rounded-full border transition ${buttonClass}`}
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadBadge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={`absolute right-0 z-50 mt-3 w-[22rem] rounded-2xl border p-3 shadow-xl ${dropdownClass}`}>
          <div className="flex items-center justify-between gap-3 px-1 pb-2">
            <div>
              <p className={`text-sm font-semibold ${labelClass}`}>Notifications</p>
              <p className={`text-xs ${mutedTextClass}`}>{unreadCount} unread</p>
            </div>
            {unreadCount > 0 && session ? (
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead(session);
                  await loadNotifications();
                }}
                className={`text-xs font-semibold ${mutedTextClass}`}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {!hasNotifications ? (
              <div className={`rounded-2xl border px-4 py-5 text-sm ${dropdownClass}`}>
                <p className={mutedTextClass}>No notifications yet.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleOpenNotification(notification)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    isDarkTheme
                      ? notification.isRead
                        ? "border-white/[0.06] bg-white/[0.03]"
                        : "border-violet-300/20 bg-violet-500/10"
                      : notification.isRead
                        ? "border-[#e4e7f1] bg-[#fafbff]"
                        : "border-violet-200 bg-violet-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedTextClass}`}>
                        {MARKETPLACE_NOTIFICATION_LABELS[notification.type] ?? notification.type}
                      </p>
                      <p className={`mt-1 text-sm font-medium ${labelClass}`}>
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead ? (
                      <span className="mt-1 inline-flex size-2 rounded-full bg-violet-500" />
                    ) : null}
                  </div>
                  <p className={`mt-2 text-xs ${mutedTextClass}`}>
                    {formatTime(notification.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
