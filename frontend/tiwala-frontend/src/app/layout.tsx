import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import Web3Provider from "@/components/providers/web3-provider";
import Navbar from "@/components/layout/navbar";

export const metadata: Metadata = {
  title: "TiwalaChain",
  description: "Blockchain-native freelancing with escrow trust.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Web3Provider>
          <Navbar />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
