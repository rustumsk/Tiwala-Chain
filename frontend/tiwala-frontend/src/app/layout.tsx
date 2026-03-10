import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import Web3Provider from "@/components/providers/web3-provider";
import RouteShell from "@/components/layout/route-shell";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TiwalaChain",
  description: "Blockchain-native freelancing with escrow trust.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <Web3Provider>
          <RouteShell>{children}</RouteShell>
          <Toaster richColors closeButton position="top-right" />
        </Web3Provider>
      </body>
    </html>
  );
}
