"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "@/components/blockchain/wallet-button";

const links = [
  { href: "/", label: "Home" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs/create", label: "Create Job" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#050a14]/85 backdrop-blur">
      <nav className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-6 md:px-12">
        <Link className="group inline-flex items-center gap-3" href="/">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-teal-400/15 text-sm font-bold text-teal-300">
            T
          </span>
          <span className="text-sm font-semibold tracking-wide text-slate-100 group-hover:text-teal-200">
            TiwalaChain
          </span>
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                className={`text-sm transition ${
                  active
                    ? "text-teal-300"
                    : "text-slate-300 hover:text-slate-100"
                }`}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <WalletButton />
      </nav>
    </header>
  );
}
