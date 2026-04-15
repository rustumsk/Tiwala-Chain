"use client";

import Link from "next/link";
import { FileSearch, Sparkles } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";

export default function PublicContractsPage() {
  const { panelClass, mutedTextClass, titleClass, pageClass, chipClass, actionChipClass } =
    useThemeStyles();

  return (
    <div className={`mx-auto min-h-screen w-full max-w-5xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
          Public contract tools
        </span>
        <h1 className={`mt-4 text-3xl font-semibold tracking-tight ${titleClass}`}>
          Open trust checks for visitors
        </h1>
        <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
          Use contract verification to confirm recorded hashes, or run a limited AI review to see the top fairness risks before you connect a wallet.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          href="/public/contracts/verify"
          className={`${panelClass} group rounded-2xl p-5 transition hover:border-violet-300/60 hover:bg-violet-500/5`}
        >
          <div className={`${actionChipClass} inline-flex rounded-xl p-3`}>
            <FileSearch size={18} />
          </div>
          <h2 className={`mt-4 text-lg font-semibold ${titleClass}`}>Verify a contract</h2>
          <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
            Paste a contract hash or upload a file to check whether it matches a TiwalaChain record.
          </p>
        </Link>

        <Link
          href="/public/ai-review"
          className={`${panelClass} group rounded-2xl p-5 transition hover:border-violet-300/60 hover:bg-violet-500/5`}
        >
          <div className={`${chipClass} inline-flex rounded-xl p-3`}>
            <Sparkles size={18} />
          </div>
          <h2 className={`mt-4 text-lg font-semibold ${titleClass}`}>Run AI review</h2>
          <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
            Upload one contract and receive a limited fairness score with key flagged clauses and short reasons.
          </p>
        </Link>
      </section>
    </div>
  );
}
