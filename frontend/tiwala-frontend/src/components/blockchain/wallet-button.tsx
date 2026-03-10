"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { notifyError } from "@/lib/notify";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import {
  AUTH_UPDATED_EVENT,
  clearAuthSession,
  getAuthStorageRaw,
  getStoredAuthSession,
  requestAuthNonce,
  saveAuthSession,
  syncProfileFromBackendUser,
  verifyWalletSignature,
  type BackendUser,
} from "@/lib/auth";

let sharedSignInWallet: string | null = null;
let sharedSignInPromise: Promise<boolean> | null = null;

type WalletButtonProps = {
  label?: string;
  buttonClassName?: string;
  connectedClassName?: string;
  wrongNetworkClassName?: string;
};

export default function WalletButton({
  label,
  buttonClassName,
  connectedClassName,
  wrongNetworkClassName,
}: WalletButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [autoAttemptedWallet, setAutoAttemptedWallet] = useState<string | null>(
    null
  );

  const authSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(AUTH_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(AUTH_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getAuthStorageRaw,
    () => null
  );

  const authSession = useMemo(() => {
    if (!authSnapshot) return null;
    return getStoredAuthSession();
  }, [authSnapshot]);

  const isAuthenticatedForWallet =
    !!authSession &&
    !!address &&
    authSession.walletAddress.toLowerCase() === address.toLowerCase();

  useEffect(() => {
    if (!address || !authSession) return;
    if (authSession.walletAddress.toLowerCase() !== address.toLowerCase()) {
      clearAuthSession();
    }
  }, [address, authSession]);

  const defaultButtonClass =
    "inline-flex h-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-400/10 px-5 text-sm font-semibold text-violet-300 transition-all duration-200 hover:border-violet-300/60 hover:bg-violet-400/20";
  const defaultConnectedClass =
    "inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-300 transition-all duration-200 hover:border-emerald-300/60 hover:bg-emerald-500/20";
  const defaultWrongNetworkClass =
    "inline-flex h-11 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/10 px-5 text-sm font-semibold text-red-300 transition-all duration-200 hover:bg-red-500/20";

  const redirectAfterAuth = useCallback(
    (user: BackendUser) => {
      const shouldRedirect =
        pathname === "/" ||
        pathname === "/unauthorized" ||
        pathname === "/pending-approval" ||
        pathname === "/onboarding";
      if (!shouldRedirect) return;

      if (!user.isApproved) {
        router.replace("/pending-approval");
        return;
      }

      if (user.role === "admin") {
        router.replace("/admin");
        return;
      }

      if (user.displayName) {
        router.replace("/dashboard");
        return;
      }

      router.replace("/onboarding");
    },
    [pathname, router]
  );

  const handleWalletSignIn = useCallback(async (silent = false) => {
    if (!address) return;
    const normalizedAddress = address.toLowerCase();
    if (!silent) {
      setAuthError("");
    }

    if (
      sharedSignInPromise &&
      sharedSignInWallet &&
      sharedSignInWallet === normalizedAddress
    ) {
      await sharedSignInPromise;
      return;
    }

    sharedSignInWallet = normalizedAddress;
    const signInAttempt = (async () => {
      setIsSigningIn(true);
      try {
        const challenge = await requestAuthNonce(address, chainId ?? 11155111);
        const signature = await signMessageAsync({ message: challenge.message });
        const result = await verifyWalletSignature({
          walletAddress: address,
          message: challenge.message,
          signature,
        });

        saveAuthSession({
          accessToken: result.accessToken,
          walletAddress: result.user.walletAddress.toLowerCase(),
          expiresAtUtc: result.expiresAtUtc,
        });
        syncProfileFromBackendUser(result.user);
        redirectAfterAuth(result.user);
        return true;
      } catch {
        clearAuthSession();
        if (!silent) {
          const msg = "Unable to sign in. Please try again.";
          setAuthError(msg);
          notifyError(msg);
        }
        return false;
      } finally {
        setIsSigningIn(false);
      }
    })();

    sharedSignInPromise = signInAttempt;
    await signInAttempt;
    if (sharedSignInWallet === normalizedAddress) {
      sharedSignInWallet = null;
      sharedSignInPromise = null;
    }
  }, [address, chainId, redirectAfterAuth, signMessageAsync]);

  useEffect(() => {
    if (!address) {
      setAutoAttemptedWallet(null);
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (isAuthenticatedForWallet || autoAttemptedWallet === normalizedAddress) {
      return;
    }

    setAutoAttemptedWallet(normalizedAddress);
    void handleWalletSignIn(true);
  }, [address, autoAttemptedWallet, handleWalletSignIn, isAuthenticatedForWallet]);

  return (
    <div className="flex flex-col items-end gap-2">
      <ConnectButton.Custom>
        {({
          account,
          chain,
          mounted,
          openAccountModal,
          openChainModal,
          openConnectModal,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          if (!connected) {
            return (
              <button
                className={buttonClassName ?? defaultButtonClass}
                onClick={openConnectModal}
                type="button"
              >
                {label ?? "Connect Wallet"}
              </button>
            );
          }

          if (chain.unsupported) {
            return (
              <button
                className={wrongNetworkClassName ?? defaultWrongNetworkClass}
                onClick={openChainModal}
                type="button"
              >
                Wrong Network
              </button>
            );
          }

          if (!isAuthenticatedForWallet) {
            return (
              <button
                className={connectedClassName ?? defaultConnectedClass}
                disabled={isSigningIn}
                onClick={() => void handleWalletSignIn(false)}
                type="button"
              >
                {isSigningIn ? "Signing..." : "Sign to continue"}
              </button>
            );
          }

          return (
            <button
              className={connectedClassName ?? defaultConnectedClass}
              onClick={openAccountModal}
              type="button"
            >
              {account.displayName}
            </button>
          );
        }}
      </ConnectButton.Custom>
      {authError ? (
        <p className="text-xs text-red-300">{authError}</p>
      ) : null}
    </div>
  );
}
