"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { fetchPublicPostingById, type PublicPostingDetail } from "@/lib/public-services";

function formatBudget(posting: PublicPostingDetail) {
  if (posting.budgetType === "range" && posting.budgetMin && posting.budgetMax) {
    return `${posting.budgetMin.toLocaleString()} - ${posting.budgetMax.toLocaleString()} USDT`;
  }

  if (posting.budgetMin) {
    return `${posting.budgetMin.toLocaleString()} USDT`;
  }

  return "Budget on request";
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PublicPostingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const {
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
  } = useThemeStyles();

  const [posting, setPosting] = useState<PublicPostingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!Number.isFinite(id)) {
        setError("Invalid posting id.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const result = await fetchPublicPostingById(id);
        if (!cancelled) {
          setPosting(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load posting.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className={`mx-auto min-h-screen w-full max-w-5xl px-4 py-10 ${pageClass}`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/public/postings" className={`${chipClass} inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition hover:border-violet-300 hover:bg-violet-500/10`}>
          <ArrowLeft size={14} />
          Back to postings
        </Link>
        <Link href="/" className={`${actionChipClass} rounded-full px-4 py-2 text-sm font-medium`}>
          Connect wallet to apply
        </Link>
      </div>

      {isLoading ? (
        <div className={`${panelClass} flex items-center gap-3 rounded-2xl px-5 py-10`}>
          <Loader2 size={18} className="animate-spin" />
          <span className={mutedTextClass}>Loading posting...</span>
        </div>
      ) : error || !posting ? (
        <div className={`${panelClass} rounded-2xl px-5 py-8`}>
          <h1 className={`text-xl font-semibold ${titleClass}`}>Posting unavailable</h1>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>{error || "This public posting could not be found."}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <section className={`${panelClass} rounded-2xl px-6 py-7`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className={`${actionChipClass} rounded-full px-3 py-1 text-xs font-semibold`}>
                    Public posting
                  </span>
                  <span className={`${chipClass} rounded-full px-3 py-1 text-xs`}>
                    {formatLabel(posting.category)}
                  </span>
                </div>
                <h1 className={`mt-4 text-3xl font-semibold tracking-tight ${titleClass}`}>{posting.title}</h1>
                <p className={`mt-3 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                  {posting.summary || "Public opportunity on TiwalaChain."}
                </p>
              </div>
              <div className={`${subtlePanelClass} min-w-64 rounded-2xl p-4`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className={mutedTextClass}>Employer</span>
                  <span className={titleClass}>{posting.employerWallet}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className={mutedTextClass}>Budget</span>
                  <span className={titleClass}>{formatBudget(posting)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className={mutedTextClass}>Timeline</span>
                  <span className={titleClass}>{posting.timeline || "Flexible"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className={mutedTextClass}>Experience</span>
                  <span className={titleClass}>{formatLabel(posting.experienceLevel)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className={`${panelClass} rounded-2xl p-6`}>
            <h2 className={`text-lg font-semibold ${titleClass}`}>Role details</h2>
            <p className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${mutedTextClass}`}>
              {posting.description || "The employer has not added an extended description for this public posting yet."}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {posting.skills.map((skill) => (
                <span key={skill} className={`${chipClass} rounded-full px-3 py-1 text-xs`}>
                  {skill}
                </span>
              ))}
            </div>
          </section>

          <section className={`${panelClass} rounded-2xl p-6`}>
            <h2 className={`text-lg font-semibold ${titleClass}`}>Want to apply?</h2>
            <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
              Applications and employer messaging stay private. Connect your wallet and finish onboarding to submit a proposal from the full marketplace.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/" className={`${actionChipClass} rounded-xl px-4 py-3 text-sm font-semibold`}>
                Connect wallet to apply
              </Link>
              <Link href="/postings" className={`${chipClass} rounded-xl px-4 py-3 text-sm font-medium transition hover:border-violet-300 hover:bg-violet-500/10`}>
                Open signed-in marketplace
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
