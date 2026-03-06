"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Zap,
  Scale,
  FileText,
  Eye,
  Users,
  ChevronRight,
} from "lucide-react";
import WalletRouteGate from "@/components/blockchain/wallet-route-gate";
import WalletButton from "@/components/blockchain/wallet-button";

const features = [
  {
    icon: Shield,
    title: "On-Chain Escrow",
    description:
      "Funds are locked in a smart contract and only released when both parties agree — no middlemen.",
  },
  {
    icon: Scale,
    title: "AI Fairness Review",
    description:
      "Every contract is scored for fairness before publishing, protecting both freelancers and employers.",
  },
  {
    icon: FileText,
    title: "Structured Contracts",
    description:
      "Define scope, milestones, deadlines, and payment terms in a guided, tamper-proof format.",
  },
  {
    icon: Eye,
    title: "Full Transparency",
    description:
      "Every job status, payment, and dispute action is recorded on the blockchain for auditable history.",
  },
  {
    icon: Zap,
    title: "Instant Payments",
    description:
      "USDT payouts settle directly to wallets — no bank delays, no platform fees eating your earnings.",
  },
  {
    icon: Users,
    title: "Built for Filipinos",
    description:
      "Designed for the Philippine freelance market with local context, fair standards, and peso-aware pricing.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create a Contract",
    description: "Define job terms, scope, and payment with AI guidance.",
  },
  {
    number: "02",
    title: "Lock Funds",
    description: "Employer deposits USDT into the escrow smart contract.",
  },
  {
    number: "03",
    title: "Complete Work",
    description: "Freelancer delivers; both parties review the output.",
  },
  {
    number: "04",
    title: "Get Paid",
    description: "Funds are released instantly once work is approved.",
  },
];

export default function Home() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative text-white">
      {/* Fixed background — stays in place as sections scroll */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 38% 100% at 0% 50%, rgba(110,55,230,0.9) 0%, rgba(70,25,200,0.45) 55%, transparent 100%)",
            "radial-gradient(ellipse 38% 100% at 100% 50%, rgba(110,55,230,0.9) 0%, rgba(70,25,200,0.45) 55%, transparent 100%)",
            "#080010",
          ].join(", "),
        }}
      />
      <WalletRouteGate />

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section
        id="hero"
        className="relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden px-6"
        style={{ scrollSnapAlign: "start", scrollMarginTop: "64px" }}
      >
        {/* Bowtie beam — softened for eye comfort */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1000 700"
        >
          <defs>
            {/* Wide ambient glow */}
            <filter id="aura" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="62" />
            </filter>
            {/* Mid-level beam body */}
            <filter id="core" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="15" />
            </filter>
            {/* Tight highlight — crisp bright edge */}
            <filter id="highlight" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>

            <linearGradient id="lg-left" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#3b0764" stopOpacity="0.62" />
              <stop offset="45%"  stopColor="#6d28d9" stopOpacity="0.95" />
              <stop offset="80%"  stopColor="#a78bfa" stopOpacity="1" />
              <stop offset="100%" stopColor="#c4b5fd" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="lg-right" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"   stopColor="#3b0764" stopOpacity="0.62" />
              <stop offset="45%"  stopColor="#6d28d9" stopOpacity="0.95" />
              <stop offset="80%"  stopColor="#a78bfa" stopOpacity="1" />
              <stop offset="100%" stopColor="#c4b5fd" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* ~63% tall at edges (y=130–570), narrows to ~7% at center tip (y=324–376) */}
          {/* Layer 1 — wide ambient aura */}
          <polygon points="0,130 512,324 512,376 0,570"      fill="url(#lg-left)"   filter="url(#aura)"      opacity="0.50" />
          <polygon points="1000,130 488,324 488,376 1000,570" fill="url(#lg-right)"  filter="url(#aura)"      opacity="0.50" />

          {/* Layer 2 — beam body */}
          <polygon points="0,130 512,324 512,376 0,570"      fill="url(#lg-left)"   filter="url(#core)"      opacity="0.84" />
          <polygon points="1000,130 488,324 488,376 1000,570" fill="url(#lg-right)"  filter="url(#core)"      opacity="0.84" />

          {/* Layer 3 — tight highlight for crisp edge */}
          <polygon points="0,130 512,324 512,376 0,570"      fill="url(#lg-left)"   filter="url(#highlight)" opacity="0.46" />
          <polygon points="1000,130 488,324 488,376 1000,570" fill="url(#lg-right)"  filter="url(#highlight)" opacity="0.46" />
        </svg>

        {/* Upper centre — badge, headline, subtext, buttons */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-start pt-14 text-center">
          <div className="reveal mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/60">
              <span className="size-1.5 rounded-full bg-violet-400" />
              Powered by Ethereum · USDT Escrow · AI Contract Review
            </div>
          </div>

          <h1 className="reveal reveal-d1 max-w-2xl text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl">
            Trust-first freelancing,
            <br />
            <span className="text-violet-300">on-chain.</span>
          </h1>

          <p className="reveal reveal-d2 mt-5 max-w-md text-sm font-medium leading-relaxed text-white/80 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
            TiwalaChain helps Filipino freelancers and employers create fair
            contracts, lock payments in escrow, and complete work with full
            blockchain transparency.
          </p>

          <div className="reveal reveal-d3 mt-8 flex flex-wrap items-center justify-center gap-3">
            <WalletButton
              label="Get Started"
              buttonClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
              connectedClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
              wrongNetworkClassName="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-300 transition-all duration-200 hover:border-red-400/70"
            />
          </div>
        </div>

        {/* Stats pinned to the bottom */}
        <div className="reveal reveal-d4 relative z-10 flex justify-center gap-12 pb-10 pt-4">
          {[
            { value: "100%", label: "On-Chain Escrow" },
            { value: "AI", label: "Reviewed Contracts" },
            { value: "USDT", label: "Instant Payouts" },
          ].map((stat) => (
            <div key={stat.value} className="text-center">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="mt-0.5 text-xs text-white/40">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section
        id="features"
        className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden px-6 py-24"
        style={{ scrollSnapAlign: "start", scrollMarginTop: "64px" }}
      >
        {/* Section atmosphere: defined blobs + crisp floor glow */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-[24%] top-[42%] h-48 w-48 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(170,120,255,0.60) 0%, rgba(170,120,255,0.26) 52%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <div
            className="absolute right-[22%] top-[40%] h-56 w-56 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(145,95,240,0.52) 0%, rgba(145,95,240,0.22) 54%, transparent 72%)",
              filter: "blur(9px)",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <div className="reveal mb-12 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Everything You Need
            </h2>
            <p className="mt-3 text-sm text-white/50">
              A complete toolkit for transparent, fair, and secure freelance work.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }, i) => (
              <article
                key={title}
                className={`reveal reveal-d${i + 1} group rounded-2xl bg-white/[0.07] p-5 backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.11]`}
              >
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-white/10 text-violet-300">
                  <Icon size={17} strokeWidth={1.8} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden px-6 py-24"
        style={{ scrollSnapAlign: "start", scrollMarginTop: "64px" }}
      >
        {/* Section atmosphere: defined floating blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-[12%] top-[28%] h-44 w-44 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(128,78,230,0.50) 0%, rgba(128,78,230,0.20) 54%, transparent 72%)",
              filter: "blur(8px)",
            }}
          />
          <div
            className="absolute right-[14%] top-[66%] h-52 w-52 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(176,126,255,0.48) 0%, rgba(176,126,255,0.18) 58%, transparent 76%)",
              filter: "blur(9px)",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <div className="reveal mb-14 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              How It Works
            </h2>
            <p className="mt-3 text-sm text-white/50">
              From contract to payout in four transparent steps.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
            {steps.map(({ number, title, description }, i) => (
              <div
                key={number}
                className={`reveal reveal-d${i + 1} text-center`}
              >
                <p className="text-5xl font-bold text-white/20">{number}</p>
                <h3 className="mt-2 text-sm font-semibold text-white">{title}</h3>
                <p className="mx-auto mt-1 max-w-[160px] text-sm text-gray-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + FOOTER ──────────────────────────────────────── */}
      <section
        id="cta"
        className="relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden"
        style={{ scrollSnapAlign: "start", scrollMarginTop: "64px" }}
      >
        {/* CTA atmosphere: kept above footer only */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 overflow-hidden">
          <div
            className="absolute -left-8 bottom-20 h-44 w-44 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(140,90,245,0.55) 0%, rgba(140,90,245,0.24) 56%, transparent 74%)",
              filter: "blur(8px)",
            }}
          />
          <div
            className="absolute -right-10 bottom-16 h-52 w-52 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(160,115,255,0.54) 0%, rgba(160,115,255,0.22) 58%, transparent 76%)",
              filter: "blur(9px)",
            }}
          />
          <div
            className="absolute bottom-20 left-0 h-10 w-full"
            style={{
              background: "rgba(214, 186, 255, 0.78)",
              boxShadow:
                "0 0 22px rgba(186, 132, 255, 0.95), 0 0 56px rgba(186, 132, 255, 0.55)",
            }}
          />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
          <h2 className="reveal text-3xl font-bold text-white md:text-4xl">
            Ready to work with trust?
          </h2>
          <p className="reveal reveal-d1 mt-4 max-w-sm text-sm text-white/50">
            Connect your wallet and create your first blockchain-protected
            freelance contract today.
          </p>
          <div className="reveal reveal-d2 mt-8">
            <WalletButton
              label="Connect Wallet"
              buttonClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
              connectedClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
              wrongNetworkClassName="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-300 transition-all duration-200"
            />
          </div>
        </div>

        <footer className="relative z-10 border-t border-white/10 bg-[#080010] px-6 py-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors duration-200 hover:text-white"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-violet-500/20 text-violet-300">
                <ChevronRight size={12} strokeWidth={3} />
              </span>
              TiwalaChain
            </Link>
            <p className="text-xs text-white/30">
              © {new Date().getFullYear()} TiwalaChain. Built on Ethereum.
            </p>
          </div>
        </footer>
      </section>
    </div>
  );
}
