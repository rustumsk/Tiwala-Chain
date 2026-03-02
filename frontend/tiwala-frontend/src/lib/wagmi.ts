import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { sepolia } from "wagmi/chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  "tiwalachain-dev-walletconnect-id";

export const wagmiConfig = getDefaultConfig({
  appName: "TiwalaChain",
  projectId,
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
