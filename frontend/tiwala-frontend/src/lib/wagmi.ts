import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId && process.env.NODE_ENV !== "development") {
  throw new Error("Missing required env: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
}

export const wagmiConfig = getDefaultConfig({
  appName: "TiwalaChain",
  projectId: projectId ?? "tiwalachain-dev-walletconnect-id",
  chains: [sepolia],
  wallets: [
    {
      groupName: "Supported Wallets",
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
  ],
  ssr: true,
});
