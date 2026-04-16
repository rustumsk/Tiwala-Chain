"use client";

import {
  darkTheme,
  lightTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

type Props = {
  children: ReactNode;
};

const THEME_KEY = "tiwala:theme";

function getInitialIsDark() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark") return true;
  return true;
}

export default function Web3Provider({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());
  const [isDark, setIsDark] = useState(getInitialIsDark);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") !== "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const rkTheme = useMemo(
    () =>
      isDark
        ? darkTheme({
            accentColor: "#14b8a6",
            accentColorForeground: "#0a0f1f",
            borderRadius: "small",
            overlayBlur: "small",
          })
        : lightTheme({
            accentColor: "#7c3aed",
            accentColorForeground: "#ffffff",
            borderRadius: "small",
            overlayBlur: "small",
          }),
    [isDark]
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider coolMode modalSize="compact" theme={rkTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
