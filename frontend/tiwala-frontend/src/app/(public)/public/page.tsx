"use client";

import Link from "next/link";
import { BriefcaseBusiness, FileSearch, Sparkles } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";

const cards = [
  {
    href: "/public/postings",
    title: "Browse job postings",
    description:
      "Explore public opportunities, filters, budgets, and role details before connecting a wallet.",
    icon: BriefcaseBusiness,
  },
  {
    href: "/public/contracts/verify",
    title: "Verify a contract",
    description:
      "Check whether a contract hash exists in TiwalaChain and compare an uploaded file to that hash.",
    icon: FileSearch,
  },
  {
    href: "/public/ai-review",
    title: "AI contract review",
    description:
      "Run a limited anonymous fairness review and see the top flagged clauses with plain-language reasons.",
    icon: Sparkles,
  },
];

export default function PublicServicesPage() {
  const {
    panelClass,
    mutedTextClass,
    titleClass,
    chipClass,
    actionChipClass,
    pageClass,
  } = useThemeStyles();

  return (
    <div className={`mx-auto min-h-screen w-full max-w-6xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
              Public services
            </span>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Try TiwalaChain before you sign in
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                These routes are public by design: browse open postings, verify a contract hash,
                and run a limited AI fairness review without wallet onboarding.
              </p>
            </div>
          </div>

          <Link href="/" className={`${chipClass} inline-flex rounded-full px-4 py-2 text-sm font-medium transition hover:border-violet-300 hover:bg-violet-500/10`}>
            Return home
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`${panelClass} group rounded-2xl p-5 transition hover:border-violet-300/60 hover:bg-violet-500/5`}
          >
            <div className={`${actionChipClass} inline-flex rounded-xl p-3`}>
              <Icon size={18} />
            </div>
            <h2 className={`mt-4 text-lg font-semibold ${titleClass}`}>{title}</h2>
            <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
