"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "@/components/blockchain/wallet-button";
import { LinkIcon } from "lucide-react";

const pageLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs/create", label: "Create Job" },
  { href: "/contracts/create", label: "Create Contract" },
];

const sectionLinks = [
  { href: "#hero", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#cta", label: "Get Started" },
];

function scrollToSection(id: string) {
  const el = document.getElementById(id.replace("#", ""));
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

export default function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-40 bg-[#080010]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-12">
        {/* Logo */}
        <Link className="group inline-flex shrink-0 items-center gap-2.5" href="/">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
            <LinkIcon size={15} strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white transition-colors duration-200 group-hover:text-violet-300">
            TiwalaChain
          </span>
        </Link>

        {/* Centered nav links */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex">
          {isHome
            ? sectionLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => scrollToSection(link.href)}
                  className="text-sm text-white/50 transition-colors duration-200 hover:text-white/90"
                >
                  {link.label}
                </button>
              ))
            : pageLinks.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-sm transition-colors duration-200 ${
                      active ? "font-medium text-white" : "text-white/50 hover:text-white/90"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
        </div>

        {/* Wallet button */}
        <WalletButton
          buttonClassName="border border-white/20 rounded-full px-4 py-2 text-sm text-white hover:border-white/60 transition-all duration-200 bg-transparent"
          connectedClassName="border border-violet-400/40 rounded-full px-4 py-2 text-sm text-violet-300 hover:border-violet-400/70 transition-all duration-200 bg-violet-500/10"
          wrongNetworkClassName="border border-red-400/40 rounded-full px-4 py-2 text-sm text-red-300 hover:border-red-400/70 transition-all duration-200 bg-red-500/10"
        />
      </nav>
    </header>
  );
}
