import { saveStoredProfile, type LocalUserProfile, type UserRole } from "@/lib/profile";

const AUTH_STORAGE_KEY = "tiwala:auth-session";
export const AUTH_UPDATED_EVENT = "tiwala:auth-updated";

const resolvedApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
if (!resolvedApiBaseUrl && process.env.NODE_ENV !== "development") {
  throw new Error("Missing required env: NEXT_PUBLIC_API_BASE_URL");
}

export const API_BASE_URL = resolvedApiBaseUrl ?? "http://localhost:5067";

export type BackendUser = {
  id: number;
  walletAddress: string;
  displayName: string | null;
  role: UserRole;
  isApproved: boolean;
  createdAt: string;
  /** Present on `GET /me` and `PUT /profile`: whether the user may call `DELETE /account`. */
  canDeleteAccount?: boolean;
};

/** Admin user list includes whether the row can be deleted (employer/freelancer/both, no ongoing jobs). */
export type AdminListedUser = Omit<BackendUser, "role"> & {
  canDelete: boolean;
  role: UserRole;
};

export type AuthSession = {
  accessToken: string;
  walletAddress: string;
  expiresAtUtc: string;
};

type AuthVerifyResponse = {
  accessToken: string;
  expiresAtUtc: string;
  user: BackendUser;
};

type AuthNonceResponse = {
  message: string;
  nonce: string;
  expiresAtUtc: string;
  chainId: number;
};

export function getStoredAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (
      !parsed.accessToken ||
      !parsed.walletAddress ||
      !parsed.expiresAtUtc ||
      isSessionExpired(parsed)
    ) {
      clearAuthSession();
      return null;
    }
    return parsed;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
}

export function getAuthStorageRaw() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function isSessionExpired(session: Pick<AuthSession, "expiresAtUtc">) {
  return new Date(session.expiresAtUtc).getTime() <= Date.now();
}

export async function requestAuthNonce(walletAddress: string, chainId: number) {
  const response = await fetch(`${API_BASE_URL}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, chainId }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as AuthNonceResponse;
}

export async function verifyWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as AuthVerifyResponse;
}

export async function fetchCurrentUser(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as BackendUser;
}

export async function deleteOwnAccount(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function updateCurrentUserProfile(
  accessToken: string,
  payload: { displayName: string; role: UserRole }
) {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as BackendUser;
}

export function syncProfileFromBackendUser(user: BackendUser) {
  const displayName =
    user.displayName ?? (user.role === "admin" ? "Admin" : null);
  if (!displayName) return;
  saveStoredProfile({
    wallet: user.walletAddress.toLowerCase(),
    displayName,
    role: user.role,
    updatedAt: new Date().toISOString(),
  } satisfies LocalUserProfile);
}

export async function adminListUsers(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/admin/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AdminListedUser[];
}

export async function adminDeleteUser(accessToken: string, userId: number) {
  const response = await fetch(`${API_BASE_URL}/api/auth/admin/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function adminApproveUser(
  accessToken: string,
  userId: number,
  approved: boolean
) {
  const response = await fetch(`${API_BASE_URL}/api/auth/admin/users/${userId}/approve`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ approved }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as BackendUser;
}

export async function adminUpdateUserRole(
  accessToken: string,
  userId: number,
  role: string
) {
  const response = await fetch(`${API_BASE_URL}/api/auth/admin/users/${userId}/role`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as BackendUser;
}
