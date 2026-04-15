"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase, ChevronLeft, ChevronRight, Clock,
  DollarSign, Plus, Search, Users, X,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useLocalUserProfile } from "@/hooks/use-local-user-profile";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { getStoredAuthSession } from "@/lib/auth";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_EXPERIENCE_LEVELS,
  MARKETPLACE_JOB_TYPES,
  MARKETPLACE_POSTED_WITHIN,
  MARKETPLACE_SORT_OPTIONS,
  POSTING_STATUS_LABELS,
} from "@/lib/marketplace-constants";
import { notifyError } from "@/lib/notify";
import { browsePostings, fetchMyPostings, type PostingResponse } from "@/lib/postings";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

type MarketplaceTab = "browse" | "mine";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBudget(p: PostingResponse) {
  if (p.budgetType === "range" && p.budgetMin && p.budgetMax)
    return `$${p.budgetMin.toLocaleString()} – $${p.budgetMax.toLocaleString()} USDT`;
  return p.budgetMin ? `$${p.budgetMin.toLocaleString()} USDT` : "Budget TBD";
}

function statusDot(s: string) {
  if (s === "Published") return "bg-emerald-500";
  if (s === "Closed" || s === "Filled") return "bg-slate-400";
  return "bg-amber-400";
}

type FilterPillProps = {
  label: string;
  active: boolean;
  onClear?: () => void;
  onClick: () => void;
  isDark: boolean;
};
function FilterPill({ label, active, onClear, onClick, isDark }: FilterPillProps) {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer";
  const activeStyle = isDark
    ? "border-violet-400/50 bg-violet-500/15 text-violet-300"
    : "border-violet-300 bg-violet-50 text-violet-700";
  const inactiveStyle = isDark
    ? "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80"
    : "border-[#e2e5f0] bg-white text-[#555c72] hover:border-violet-200 hover:text-violet-700";
  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? activeStyle : inactiveStyle}`}>
      {label}
      {active && onClear && (
        <span
          role="button"
          tabIndex={0}
          className="ml-0.5 opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClear(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClear(); } }}
        >
          <X size={10} />
        </span>
      )}
    </button>
  );
}

export default function PostingsPage() {
  const { address } = useAccount();
  const { pageClass, mutedTextClass, titleClass, chipClass, actionChipClass, isDarkTheme } = useThemeStyles();
  const profile = useLocalUserProfile(address);
  const canManage = profile?.role === "employer" || profile?.role === "both";

  const [tab, setTab] = useState<MarketplaceTab>("browse");
  const [browseItems, setBrowseItems] = useState<PostingResponse[]>([]);
  const [myItems, setMyItems] = useState<PostingResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Search state
  const [draft, setDraft] = useState("");        // what's typed, not yet submitted
  const [search, setSearch] = useState("");      // committed query
  const [category, setCategory] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [jobType, setJobType] = useState("");
  const [postedWithin, setPostedWithin] = useState("any");
  const [sort, setSort] = useState("newest");

  const session = useMemo(() => {
    if (!address) return null;
    const s = getStoredAuthSession();
    return s?.walletAddress.toLowerCase() === address.toLowerCase() ? s : null;
  }, [address]);

  const loadListings = useCallback(async (silent = false) => {
    if (!silent) { setIsLoading(true); setError(""); }
    try {
      const data = await browsePostings({
        q: search.trim() || undefined,
        category: category || undefined,
        experienceLevel: experienceLevel || undefined,
        jobType: jobType || undefined,
        postedWithin: postedWithin === "any" ? undefined : postedWithin,
        sort,
        page,
        pageSize: 15,
      });
      setBrowseItems(data.items);
      setTotalCount(data.totalCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load postings.";
      setError(msg);
      if (!silent) notifyError(msg);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [category, experienceLevel, jobType, page, postedWithin, search, sort]);

  const loadMine = useCallback(async (silent = false) => {
    if (!canManage || !address || !session) return;
    if (!silent) { setIsLoading(true); setError(""); }
    try {
      setMyItems(await fetchMyPostings(session));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load postings.";
      setError(msg);
      if (!silent) notifyError(msg);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [address, canManage, session]);

  useEffect(() => {
    if (tab === "mine") { void loadMine(false); return; }
    void loadListings(false);
  }, [loadListings, loadMine, tab]);

  useVisibleInterval(
    () => tab === "mine" ? void loadMine(true) : void loadListings(true),
    API_POLL_INTERVAL_MS,
    true
  );

  const submitSearch = () => { setSearch(draft); setPage(1); };
  const clearAll = () => { setSearch(""); setDraft(""); setCategory(""); setExperienceLevel(""); setJobType(""); setPostedWithin("any"); setSort("newest"); setPage(1); };

  const visibleItems = tab === "mine" ? myItems : browseItems;
  const totalPages = Math.max(1, Math.ceil(totalCount / 15));
  const hasFilters = search || category || experienceLevel || jobType || postedWithin !== "any";

  // Style tokens
  const bd = isDarkTheme ? "border-white/[0.08]" : "border-[#e5e8f2]";
  const cardBg = isDarkTheme ? "bg-[#0e1320]" : "bg-white";
  const searchBarBg = isDarkTheme ? "bg-[#111827]" : "bg-white";

  return (
    <div className={pageClass}>
      <div className="mx-auto w-full max-w-[900px] space-y-5">

        {/* ── Page header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-[22px] font-bold tracking-tight ${titleClass}`}>
              {tab === "mine" ? "My postings" : "Job postings"}
            </h1>
            <p className={`mt-0.5 text-sm ${mutedTextClass}`}>
              {tab === "mine"
                ? "Manage your listings and review incoming proposals."
                : `${totalCount > 0 ? `${totalCount.toLocaleString()} open role${totalCount !== 1 ? "s" : ""}` : "Open roles"} on TiwalaChain`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canManage && (
              <>
                {/* Tab toggle */}
                <div className={`flex overflow-hidden rounded-xl border text-sm ${bd}`}>
                  <button
                    type="button"
                    onClick={() => setTab("browse")}
                    className={`px-4 py-2 font-medium transition ${tab === "browse"
                      ? isDarkTheme ? "bg-violet-500/20 text-violet-300" : "bg-violet-50 text-violet-700"
                      : isDarkTheme ? "text-white/50 hover:text-white/80" : "text-[#6b7089] hover:text-[#2e3450]"
                    }`}
                  >
                    Browse
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("mine")}
                    className={`border-l px-4 py-2 font-medium transition ${bd} ${tab === "mine"
                      ? isDarkTheme ? "bg-violet-500/20 text-violet-300" : "bg-violet-50 text-violet-700"
                      : isDarkTheme ? "text-white/50 hover:text-white/80" : "text-[#6b7089] hover:text-[#2e3450]"
                    }`}
                  >
                    My postings
                  </button>
                </div>

                <Link
                  href="/postings/create"
                  className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition ${actionChipClass}`}
                >
                  <Plus size={14} />
                  Post a job
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Search bar (browse only) ── */}
        {tab === "browse" && (
          <div className={`rounded-2xl border ${bd} ${searchBarBg} overflow-hidden`}>
            {/* Main search input row */}
            <div className="flex items-stretch">
              <div className="flex flex-1 items-center gap-2 px-4">
                <Search size={16} className={`shrink-0 ${mutedTextClass}`} />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Job title, skill, or keyword…"
                  className={`h-12 flex-1 bg-transparent text-sm outline-none ${isDarkTheme ? "text-white placeholder:text-white/35" : "text-[#11131b] placeholder:text-[#9299ae]"}`}
                />
                {draft && (
                  <button type="button" onClick={() => setDraft("")} className={`shrink-0 ${mutedTextClass} hover:text-red-400 transition-colors`}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={submitSearch}
                className={`m-1.5 shrink-0 rounded-xl px-5 text-sm font-semibold transition ${actionChipClass}`}
              >
                Search
              </button>
            </div>

            {/* Filter pills row */}
            <div className={`flex flex-wrap gap-1.5 border-t px-4 py-2.5 ${bd}`}>
              {/* Category */}
              {MARKETPLACE_CATEGORIES.map((c) => (
                <FilterPill
                  key={c.value}
                  label={c.label}
                  active={category === c.value}
                  isDark={isDarkTheme}
                  onClick={() => { setCategory(category === c.value ? "" : c.value); setPage(1); }}
                  onClear={() => { setCategory(""); setPage(1); }}
                />
              ))}
            </div>

            {/* Secondary filters + sort */}
            <div className={`flex flex-wrap items-center gap-2 border-t px-4 py-2.5 ${bd}`}>
              <select
                value={postedWithin}
                onChange={(e) => { setPostedWithin(e.target.value); setPage(1); }}
                className={`h-8 rounded-lg border bg-transparent px-2.5 text-xs outline-none transition ${isDarkTheme ? "border-white/10 text-white/60 hover:border-white/20" : "border-[#e2e5f0] text-[#555c72] hover:border-violet-200"}`}
              >
                {MARKETPLACE_POSTED_WITHIN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <select
                value={experienceLevel}
                onChange={(e) => { setExperienceLevel(e.target.value); setPage(1); }}
                className={`h-8 rounded-lg border bg-transparent px-2.5 text-xs outline-none transition ${isDarkTheme ? "border-white/10 text-white/60 hover:border-white/20" : "border-[#e2e5f0] text-[#555c72] hover:border-violet-200"}`}
              >
                <option value="">Any level</option>
                {MARKETPLACE_EXPERIENCE_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <select
                value={jobType}
                onChange={(e) => { setJobType(e.target.value); setPage(1); }}
                className={`h-8 rounded-lg border bg-transparent px-2.5 text-xs outline-none transition ${isDarkTheme ? "border-white/10 text-white/60 hover:border-white/20" : "border-[#e2e5f0] text-[#555c72] hover:border-violet-200"}`}
              >
                <option value="">Any type</option>
                {MARKETPLACE_JOB_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <div className={`ml-auto flex items-center gap-1.5 text-xs ${mutedTextClass}`}>
                <span>Sort:</span>
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value); setPage(1); }}
                  className={`h-8 rounded-lg border bg-transparent px-2.5 text-xs outline-none transition ${isDarkTheme ? "border-white/10 text-white/60 hover:border-white/20" : "border-[#e2e5f0] text-[#555c72] hover:border-violet-200"}`}
                >
                  {MARKETPLACE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {hasFilters && (
                <button type="button" onClick={clearAll} className={`ml-2 text-xs transition hover:text-red-400 ${mutedTextClass}`}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Results count bar ── */}
        <div className={`flex items-center justify-between border-b pb-3 ${bd}`}>
          <p className={`text-sm ${mutedTextClass}`}>
            {isLoading
              ? "Loading…"
              : tab === "mine"
                ? `${myItems.length} posting${myItems.length !== 1 ? "s" : ""}`
                : `${totalCount.toLocaleString()} result${totalCount !== 1 ? "s" : ""}`}
          </p>
          {tab === "browse" && totalPages > 1 && !isLoading && (
            <p className={`text-xs ${mutedTextClass}`}>Page {page} of {totalPages}</p>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
            {error}
          </div>
        )}

        {/* ── Job list ── */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`h-28 animate-pulse rounded-2xl border ${bd} ${isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]"}`} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className={`flex flex-col items-center justify-center rounded-2xl border py-16 text-center ${bd} ${isDarkTheme ? "bg-white/[0.01]" : "bg-[#fafbff]"}`}>
            <Briefcase size={28} className={mutedTextClass} />
            <p className={`mt-3 text-base font-semibold ${titleClass}`}>
              {tab === "mine" ? "No postings yet" : "No results"}
            </p>
            <p className={`mt-1 max-w-xs text-sm ${mutedTextClass}`}>
              {tab === "mine"
                ? "Post your first job to start receiving proposals."
                : "Try different keywords or remove some filters."}
            </p>
            {tab === "mine" && canManage && (
              <Link href="/postings/create" className={`mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
                <Plus size={14} /> Post a job
              </Link>
            )}
          </div>
        ) : (
          <div className={`overflow-hidden rounded-2xl border ${bd} ${cardBg}`}>
            {visibleItems.map((posting, idx) => (
              <Link
                key={posting.id}
                href={`/postings/${posting.id}`}
                className={`group block px-6 py-5 transition ${idx !== 0 ? `border-t ${bd}` : ""} ${isDarkTheme ? "hover:bg-white/[0.03]" : "hover:bg-violet-50/30"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    {/* Tag row */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex size-1.5 shrink-0 rounded-full ${statusDot(posting.status)}`} />
                      <span className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${isDarkTheme ? "text-white/40" : "text-[#8b90a6]"}`}>
                        {MARKETPLACE_CATEGORIES.find((c) => c.value === posting.category)?.label ?? posting.category}
                      </span>
                      <span className={`text-[11px] ${isDarkTheme ? "text-white/25" : "text-[#c2c6d4]"}`}>·</span>
                      <span className={`text-[11px] ${isDarkTheme ? "text-white/40" : "text-[#8b90a6]"}`}>
                        {POSTING_STATUS_LABELS[posting.status] ?? posting.status}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className={`text-[16px] font-semibold leading-snug transition-colors group-hover:text-violet-500 ${titleClass}`}>
                      {posting.title}
                    </h3>

                    {/* Employer + time */}
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {posting.employerDisplayName ?? `${posting.employerWallet.slice(0, 6)}…${posting.employerWallet.slice(-4)}`}
                      <span className="mx-1.5 opacity-30">·</span>
                      {timeAgo(posting.publishedAt ?? posting.createdAt)}
                    </p>

                    {/* Summary */}
                    {(posting.summary || posting.description) && (
                      <p className={`mt-2 line-clamp-2 text-sm leading-relaxed ${mutedTextClass}`}>
                        {posting.summary || posting.description}
                      </p>
                    )}

                    {/* Skills */}
                    {posting.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {posting.skills.slice(0, 5).map((skill) => (
                          <span key={skill} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${isDarkTheme ? "border-white/10 bg-white/[0.04] text-white/60" : "border-[#e5e8f2] bg-[#f8f9fc] text-[#555c72]"}`}>
                            {skill}
                          </span>
                        ))}
                        {posting.skills.length > 5 && (
                          <span className={`text-[11px] ${mutedTextClass}`}>+{posting.skills.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: budget + meta */}
                  <div className="hidden shrink-0 flex-col items-end gap-2.5 sm:flex">
                    <p className={`text-sm font-semibold tabular-nums ${titleClass}`}>
                      {formatBudget(posting)}
                    </p>
                    {posting.timeline && (
                      <p className={`flex items-center gap-1 text-xs ${mutedTextClass}`}>
                        <Clock size={11} />
                        {posting.timeline}
                      </p>
                    )}
                    <p className={`flex items-center gap-1 text-xs ${mutedTextClass}`}>
                      <Users size={11} />
                      {posting.proposalCount} proposal{posting.proposalCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Mobile meta */}
                <div className={`mt-2.5 flex flex-wrap gap-3 text-xs sm:hidden ${mutedTextClass}`}>
                  <span className="flex items-center gap-1"><DollarSign size={11} />{formatBudget(posting)}</span>
                  {posting.timeline && <span className="flex items-center gap-1"><Clock size={11} />{posting.timeline}</span>}
                  <span className="flex items-center gap-1"><Users size={11} />{posting.proposalCount} proposals</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {tab === "browse" && totalPages > 1 && !isLoading && (
          <div className={`flex items-center justify-between border-t pt-4 ${bd}`}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 ${chipClass}`}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <p className={`text-sm ${mutedTextClass}`}>Page {page} of {totalPages}</p>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 ${chipClass}`}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
