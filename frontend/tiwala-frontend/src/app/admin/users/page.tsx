"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Trash2 } from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import { getStoredProfile } from "@/lib/profile";
import {
  adminApproveUser,
  adminDeleteUser,
  adminListUsers,
  adminUpdateUserRole,
  getStoredAuthSession,
  type BackendUser,
} from "@/lib/auth";
import { notifyError, notifySuccess } from "@/lib/notify";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const ROLE_OPTIONS = ["freelancer", "employer", "both", "admin"] as const;

export default function AdminUsersPage() {
  const { address, isConnected } = useAccount();
  const { isDarkTheme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const isAdmin = profile?.role === "admin";

  const [users, setUsers] = useState<BackendUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [approvalConfirmId, setApprovalConfirmId] = useState<number | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<
    | {
        userId: number;
        approved: boolean;
      }
    | null
  >(null);

  const loadUsers = useCallback(async () => {
    const session = getStoredAuthSession();
    if (!session) return;
    setIsLoading(true);
    setError("");
    try {
      const result = await adminListUsers(session.accessToken);
      setUsers(result);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load users.";
      setError(msg);
      notifyError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const handleApproval = async (userId: number, approved: boolean) => {
    const session = getStoredAuthSession();
    if (!session) return;
    setActionLoading(userId);
    try {
      const updated = await adminApproveUser(session.accessToken, userId, approved);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      notifySuccess(approved ? "User approved." : "User approval revoked.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update approval.";
      setError(msg);
      notifyError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    const session = getStoredAuthSession();
    if (!session) return;
    setActionLoading(userId);
    try {
      const updated = await adminUpdateUserRole(session.accessToken, userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      notifySuccess("User role updated.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update role.";
      setError(msg);
      notifyError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: number) => {
    const session = getStoredAuthSession();
    if (!session) return;
    setActionLoading(userId);
    try {
      await adminDeleteUser(session.accessToken, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirmId(null);
      notifySuccess("User deleted.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete user.";
      setError(msg);
      notifyError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const selectClass = isDarkTheme
    ? "h-8 rounded-lg border border-white/14 bg-black/40 px-2 text-xs text-white outline-none focus:border-violet-400/50"
    : "h-8 rounded-lg border border-[#e1e4f0] bg-white px-2 text-xs text-[#11131b] outline-none focus:border-violet-400";

  if (!isAdmin) {
    return (
      <div className={pageClass}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8`}>
          <h1 className={`text-2xl font-semibold ${titleClass}`}>Access denied</h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>Admin access required.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Moderator
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            User management
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            View all registered users, change roles, or remove accounts.
          </p>
        </article>

        {error ? (
          <div className={`rounded-xl border p-4 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
            {error}
          </div>
        ) : null}

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Accounts</p>
              <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
                Registered users
              </h2>
            </div>
            <span className={`text-xs ${mutedTextClass}`}>{users.length} total</span>
          </div>

          {isLoading ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>Loading users...</p>
          ) : users.length === 0 ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>No users found.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className={`hidden grid-cols-[60px_1fr_1fr_120px_100px_120px_60px] gap-3 px-4 pb-2 text-[11px] uppercase tracking-[0.14em] lg:grid ${isDarkTheme ? "border-b border-white/10" : "border-b border-[#eceef5]"}`}>
                <span className={tinyLabelClass}>ID</span>
                <span className={tinyLabelClass}>Wallet</span>
                <span className={tinyLabelClass}>Display name</span>
                <span className={tinyLabelClass}>Role</span>
                <span className={tinyLabelClass}>Status</span>
                <span className={tinyLabelClass}>Joined</span>
                <span className={`text-right ${tinyLabelClass}`}>Action</span>
              </div>
              {users.map((user) => {
                const isSelf = address?.toLowerCase() === user.walletAddress.toLowerCase();
                return (
                  <div
                    key={user.id}
                    className={`${subtlePanelClass} grid items-center gap-3 rounded-xl px-4 py-3 text-sm lg:grid-cols-[60px_1fr_1fr_120px_100px_120px_60px]`}
                  >
                    <span className={`font-semibold tabular-nums ${titleClass}`}>#{user.id}</span>
                    <span className={`truncate font-mono text-xs ${mutedTextClass}`}>
                      {shortAddr(user.walletAddress)}
                    </span>
                    <span className={`truncate ${titleClass}`}>
                      {user.displayName || <span className={mutedTextClass}>Not set</span>}
                    </span>
                    <div>
                      <select
                        className={selectClass}
                        value={user.role}
                        disabled={isSelf || actionLoading === user.id}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {user.isApproved ? (
                        <button
                          type="button"
                          onClick={() => {
                            setApprovalConfirmId(user.id);
                            setApprovalTarget({ userId: user.id, approved: false });
                          }}
                          disabled={isSelf || actionLoading === user.id}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${isDarkTheme ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-red-500/10 hover:text-red-200 hover:border-red-400/40" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200"}`}
                        >
                          Approved
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setApprovalConfirmId(user.id);
                            setApprovalTarget({ userId: user.id, approved: true });
                          }}
                          disabled={actionLoading === user.id}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${isDarkTheme ? "border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-emerald-500/10 hover:text-emerald-200 hover:border-emerald-400/40" : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"}`}
                        >
                          Pending
                        </button>
                      )}
                    </div>
                    <span className={`text-xs ${mutedTextClass}`}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                    <div className="text-right">
                      {deleteConfirmId === user.id ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(user.id)}
                            disabled={actionLoading === user.id}
                            className="text-xs font-semibold text-red-400 hover:text-red-300"
                          >
                            {actionLoading === user.id ? "..." : "Yes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className={`text-xs ${mutedTextClass}`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(user.id)}
                          disabled={isSelf}
                          className={`inline-flex items-center justify-center rounded-lg p-1.5 transition disabled:opacity-30 ${isDarkTheme ? "text-white/40 hover:bg-white/[0.06] hover:text-red-400" : "text-[#9299ae] hover:bg-red-50 hover:text-red-600"}`}
                          title={isSelf ? "Cannot delete your own account" : "Delete user"}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {approvalConfirmId !== null && approvalTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div
            className={`w-full max-w-sm rounded-xl border px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${
              isDarkTheme ? "border-white/14 bg-[#050814]" : "border-[#e3e5f2] bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500/80">
              Confirm {approvalTarget.approved ? "approval" : "revocation"}
            </p>
            <h2 className={`mt-2 text-lg font-semibold ${titleClass}`}>
              {approvalTarget.approved ? "Approve this account?" : "Revoke approval?"}
            </h2>
            <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
              {approvalTarget.approved
                ? "This user will be able to access their dashboard once approved."
                : "This user will lose access and be returned to the pending approval state."}
            </p>
            <div className="mt-5 flex justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setApprovalConfirmId(null);
                  setApprovalTarget(null);
                }}
                className={`rounded-lg px-3 py-1.5 ${mutedTextClass}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleApproval(approvalTarget.userId, approvalTarget.approved);
                  setApprovalConfirmId(null);
                  setApprovalTarget(null);
                }}
                disabled={actionLoading === approvalTarget.userId}
                className={`rounded-lg px-3 py-1.5 font-semibold text-white ${
                  approvalTarget.approved
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500"
                } disabled:opacity-60`}
              >
                {actionLoading === approvalTarget.userId
                  ? "Saving..."
                  : approvalTarget.approved
                  ? "Approve"
                  : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
