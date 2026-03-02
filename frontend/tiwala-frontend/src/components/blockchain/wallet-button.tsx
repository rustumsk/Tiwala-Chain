"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

type WalletButtonProps = {
  label?: string;
};

export default function WalletButton({ label }: WalletButtonProps) {
  return (
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
              className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300/60 hover:bg-cyan-400/20"
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
              className="inline-flex h-11 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/10 px-5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              onClick={openChainModal}
              type="button"
            >
              Wrong Network
            </button>
          );
        }

        return (
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-300 transition hover:border-emerald-300/60 hover:bg-emerald-500/20"
            onClick={openAccountModal}
            type="button"
          >
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
