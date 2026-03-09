"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import {
  AUTH_UPDATED_EVENT,
  clearAuthSession,
  getAuthStorageRaw,
  getStoredAuthSession,
  requestAuthNonce,
  saveAuthSession,
  syncProfileFromBackendUser,
  verifyWalletSignature,
} from "@/lib/auth";

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
  const { address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");

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

  const handleWalletSignIn = async () => {
    if (!address) return;
    setAuthError("");
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
    } catch {
      clearAuthSession();
      setAuthError("Unable to sign in. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnect = () => {
    clearAuthSession();
    disconnect();
  };

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
              <div className="flex items-center gap-2">
                <button
                  className={connectedClassName ?? defaultConnectedClass}
                  disabled={isSigningIn}
                  onClick={handleWalletSignIn}
                  type="button"
                >
                  {isSigningIn ? "Signing In..." : "Sign In"}
                </button>
                <button
                  className={buttonClassName ?? defaultButtonClass}
                  onClick={handleDisconnect}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
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
