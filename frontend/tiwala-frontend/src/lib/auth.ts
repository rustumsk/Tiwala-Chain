import { saveStoredProfile, type LocalUserProfile, type UserRole } from "@/lib/profile";

const AUTH_STORAGE_KEY = "tiwala:auth-session";
export const AUTH_UPDATED_EVENT = "tiwala:auth-updated";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
  "http://localhost:5067";

export type BackendUser = {
  id: number;
  walletAddress: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
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
  if (!user.displayName) return;
  saveStoredProfile({
    wallet: user.walletAddress.toLowerCase(),
    displayName: user.displayName,
    role: user.role,
    updatedAt: new Date().toISOString(),
  } satisfies LocalUserProfile);
}
