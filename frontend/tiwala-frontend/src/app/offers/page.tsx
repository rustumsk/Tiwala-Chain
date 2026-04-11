"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { usePersistedSessionString } from "@/hooks/use-persisted-session-string";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useAppTheme } from "@/components/layout/theme-context";
import { getStoredAuthSession } from "@/lib/auth";
import { notifyError } from "@/lib/notify";
import { getStoredProfile } from "@/lib/profile";
import {
  fetchIncomingOffers,
  fetchSentOffers,
  type JobResponse,
} from "@/lib/jobs";
import { API_POLL_INTERVAL_MS } from "@/lib/realtime";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const OFFER_STATUS_FILTERS = ["all", "pending", "accepted", "declined"] as const;
type OfferStatusFilter = (typeof OFFER_STATUS_FILTERS)[number];

export default function OffersPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { isDarkTheme } = useAppTheme();

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);

  const [offers, setOffers] = useState<JobResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = usePersistedSessionString<OfferStatusFilter>(
    "tiwala:offers:statusFilter",
    "all",
    OFFER_STATUS_FILTERS
  );

  const loadOffers = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isConnected || !address) return;
      const session = getStoredAuthSession();
      if (!session || session.walletAddress.toLowerCase() !== address.toLowerCase()) {
        return;
      }

      if (!opts?.silent) {
        setIsLoading(true);
        setError("");
      }

      const loader =
        profile?.role === "employer" ? fetchSentOffers : fetchIncomingOffers;

      try {
        const data = await loader(session);
        setOffers(data);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load offers.";
        setError(msg);
        if (!opts?.silent) {
          notifyError(msg);
        }
      } finally {
        if (!opts?.silent) {
          setIsLoading(false);
        }
      }
    },
    [address, isConnected, profile?.role]
  );

  useEffect(() => {
    void loadOffers({ silent: false });
  }, [loadOffers]);

  useVisibleInterval(
    () => void loadOffers({ silent: true }),
    API_POLL_INTERVAL_MS,
    Boolean(
      isConnected &&
        address &&
        getStoredAuthSession()?.walletAddress.toLowerCase() === address.toLowerCase() &&
        profile
    )
  );

  const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";
  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";

  if (!isConnected) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job offers
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Connect wallet to continue
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Connect your wallet from the navbar to see offers sent to you.
          </p>
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={pageClass}>
        <section
          className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Job offers
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Complete onboarding
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Finish your profile setup so we can match offers to your wallet.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            {profile.role === "employer"
              ? "Employer"
              : "Freelancer"}
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            {profile.role === "employer"
              ? "Sent job offers"
              : "Incoming job offers"}
          </h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
            {profile.role === "employer"
              ? "Review contracts you have sent to freelancers, and track whether they are pending, accepted, or declined."
              : "Review contracts that employers have sent to your wallet, run AI analysis, and accept or decline the work."}
          </p>
        </article>

        {error ? (
          <div
            className={`rounded-xl border p-4 text-sm ${
              isDarkTheme
                ? "border-red-400/30 bg-red-500/10 text-red-200"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {error}
          </div>
        ) : null}

        <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}
              >
                Offers
              </p>
              <h2
                className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}
              >
                {profile.role === "employer"
                  ? "Your job offers"
                  : "Pending job offers"}
              </h2>
            </div>
            <span className={`text-xs ${mutedTextClass}`}>{offers.length} total</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "accepted", label: "Accepted" },
              { key: "declined", label: "Declined" },
            ].map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key as OfferStatusFilter)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    active
                      ? isDarkTheme
                        ? "border border-violet-300/60 bg-violet-500/25 text-violet-50"
                        : "border border-violet-400 bg-violet-100 text-violet-800"
                      : isDarkTheme
                      ? "border border-white/12 bg-white/[0.02] text-white/70 hover:border-violet-300/40 hover:bg-violet-500/15"
                      : "border border-[#e1e4f0] bg-white text-[#555a6b] hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>Loading offers...</p>
          ) : offers.length === 0 ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>
              {profile.role === "employer"
                ? "You haven't sent any job offers yet. Create a job from the dashboard to send your first proposal."
                : "No pending offers right now. When employers send job proposals to your wallet, they will appear here."}
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {offers
                .filter((offer) => {
                  if (statusFilter === "all") return true;
                  if (statusFilter === "pending")
                    return (
                      offer.status === "PendingOffer" ||
                      offer.status === "pendingoffer" ||
                      offer.status === "pending"
                    );
                  if (statusFilter === "accepted")
                    return (
                      offer.status === "Accepted" ||
                      offer.status === "accepted"
                    );
                  if (statusFilter === "declined")
                    return (
                      offer.status === "Declined" ||
                      offer.status === "declined"
                    );
                  return true;
                })
                .map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={async () => {
                    // For now, navigate to offers detail page; later we can open modal
                    router.push(`/offers/${offer.id}`);
                  }}
                  className={`${subtlePanelClass} flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                >
                  <div>
                    <p className={`text-xs ${tinyLabelClass}`}>Job</p>
                    <p className={`mt-0.5 text-sm font-semibold ${titleClass}`}>
                      {offer.title || `Offer #${offer.id}`}
                    </p>
                  </div>
                  <div className="hidden flex-1 flex-col sm:flex">
                    <p className={`text-xs ${tinyLabelClass}`}>Employer</p>
                    <p className={`mt-0.5 text-xs ${mutedTextClass}`}>
                      {profile.role === "employer"
                        ? shortAddr(offer.freelancerWallet)
                        : shortAddr(offer.employerWallet)}
                    </p>
                  </div>
                  <div className="hidden flex-1 flex-col md:flex">
                    <p className={`text-xs ${tinyLabelClass}`}>Created</p>
                    <p className={`mt-0.5 text-xs ${mutedTextClass}`}>
                      {new Date(offer.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${
                          offer.status === "Accepted"
                            ? isDarkTheme
                              ? "border-emerald-400/40 bg-emerald-500/12 text-emerald-200"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : offer.status === "Declined"
                            ? isDarkTheme
                              ? "border-red-400/40 bg-red-500/12 text-red-200"
                              : "border-red-200 bg-red-50 text-red-700"
                            : isDarkTheme
                            ? "border-amber-400/40 bg-amber-500/12 text-amber-200"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {offer.status === "Accepted"
                        ? "Accepted"
                        : offer.status === "Declined"
                        ? "Declined"
                        : "Pending offer"}
                    </span>
                    <span className={`text-[11px] ${mutedTextClass}`}>
                      {profile.role === "employer"
                        ? "Click to view"
                        : "Click to review"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

