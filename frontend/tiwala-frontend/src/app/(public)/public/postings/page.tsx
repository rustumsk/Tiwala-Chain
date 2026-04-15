"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Loader2, Search } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_EXPERIENCE_LEVELS,
  MARKETPLACE_JOB_TYPES,
  MARKETPLACE_POSTED_WITHIN,
  MARKETPLACE_SORT_OPTIONS,
} from "@/lib/marketplace-constants";
import {
  browsePublicPostings,
  type PublicPostingSummary,
} from "@/lib/public-services";

function formatBudget(posting: PublicPostingSummary) {
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

export default function PublicPostingsPage() {
  const {
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
    inputClass,
  } = useThemeStyles();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [jobType, setJobType] = useState("");
  const [postedWithin, setPostedWithin] = useState("");
  const [sort, setSort] = useState("newest");
  const [items, setItems] = useState<PublicPostingSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const result = await browsePublicPostings({
          q: query || undefined,
          category: category || undefined,
          experienceLevel: experienceLevel || undefined,
          jobType: jobType || undefined,
          postedWithin: postedWithin || undefined,
          sort,
        });

        if (!cancelled) {
          setItems(result.items);
          setTotalCount(result.totalCount);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load postings.");
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
  }, [category, experienceLevel, jobType, postedWithin, query, sort]);

  const activeFilterCount = useMemo(
    () => [query, category, experienceLevel, jobType, postedWithin].filter(Boolean).length,
    [category, experienceLevel, jobType, postedWithin, query]
  );

  return (
    <div className={`mx-auto min-h-screen w-full max-w-7xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
              Public marketplace
            </span>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Browse open job postings
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Visitors can explore public opportunities and evaluate the market before signing in.
                Applying and messaging stay private until wallet onboarding.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className={`${chipClass} rounded-full px-3 py-2`}>
              {totalCount} public postings
            </span>
            <Link href="/" className={`${chipClass} rounded-full px-3 py-2 transition hover:border-violet-300 hover:bg-violet-500/10`}>
              Connect wallet
            </Link>
          </div>
        </div>
      </section>

      <section className={`${panelClass} mt-6 rounded-2xl p-5`}>
        <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <label className="flex items-center gap-2 rounded-xl border border-transparent bg-transparent">
            <Search size={16} className="opacity-60" />
            <input
              className={`${inputClass} border-0 bg-transparent px-0 focus:border-0`}
              placeholder="Search title, description, or skills"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {MARKETPLACE_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select className={inputClass} value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}>
            <option value="">Any level</option>
            {MARKETPLACE_EXPERIENCE_LEVELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select className={inputClass} value={jobType} onChange={(event) => setJobType(event.target.value)}>
            <option value="">Any job type</option>
            {MARKETPLACE_JOB_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select className={inputClass} value={postedWithin} onChange={(event) => setPostedWithin(event.target.value)}>
            {MARKETPLACE_POSTED_WITHIN.map((option) => (
              <option key={option.value} value={option.value === "any" ? "" : option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`${chipClass} rounded-full px-3 py-1`}>
              {activeFilterCount} filters active
            </span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className={`${chipClass} rounded-full px-3 py-1 transition hover:border-violet-300 hover:bg-violet-500/10`}
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setExperienceLevel("");
                  setJobType("");
                  setPostedWithin("");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <select className={`${inputClass} max-w-48`} value={sort} onChange={(event) => setSort(event.target.value)}>
            {MARKETPLACE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-6">
        {isLoading ? (
          <div className={`${panelClass} flex items-center gap-3 rounded-2xl px-5 py-10`}>
            <Loader2 size={18} className="animate-spin" />
            <span className={mutedTextClass}>Loading public postings...</span>
          </div>
        ) : error ? (
          <div className={`${panelClass} rounded-2xl px-5 py-6 text-sm text-red-600`}>
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className={`${panelClass} rounded-2xl px-5 py-10 text-center`}>
            <BriefcaseBusiness size={20} className="mx-auto opacity-70" />
            <h2 className={`mt-4 text-lg font-semibold ${titleClass}`}>No public postings found</h2>
            <p className={`mt-2 text-sm ${mutedTextClass}`}>
              Try clearing some filters, or check back after more employers publish roles.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((posting) => (
              <Link
                key={posting.id}
                href={`/public/postings/${posting.id}`}
                className={`${panelClass} group rounded-2xl p-5 transition hover:border-violet-300/60 hover:bg-violet-500/5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                      {formatLabel(posting.category)}
                    </p>
                    <h2 className={`mt-2 text-lg font-semibold ${titleClass}`}>{posting.title}</h2>
                  </div>
                  <span className={`${actionChipClass} rounded-full px-3 py-1 text-xs font-medium`}>
                    {formatLabel(posting.experienceLevel)}
                  </span>
                </div>

                <p className={`mt-3 line-clamp-3 text-sm leading-6 ${mutedTextClass}`}>
                  {posting.summary || "Open role on TiwalaChain. Open the detail page to see the full brief."}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {posting.skills.slice(0, 4).map((skill) => (
                    <span key={skill} className={`${chipClass} rounded-full px-3 py-1 text-xs`}>
                      {skill}
                    </span>
                  ))}
                </div>

                <div className={`${subtlePanelClass} mt-5 rounded-xl p-4`}>
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
