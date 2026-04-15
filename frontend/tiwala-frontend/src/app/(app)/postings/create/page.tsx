"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Calendar, Check, DollarSign, FileText, HelpCircle, Settings, Tag, X } from "lucide-react";
import { useAccount } from "wagmi";
import { useLocalUserProfile } from "@/hooks/use-local-user-profile";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { getStoredAuthSession } from "@/lib/auth";
import {
  MARKETPLACE_BUDGET_TYPES,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_EXPERIENCE_LEVELS,
  MARKETPLACE_JOB_TYPES,
  MARKETPLACE_SUGGESTED_SKILLS,
  MARKETPLACE_VISIBILITY_OPTIONS,
} from "@/lib/marketplace-constants";
import { notifyError, notifySuccess } from "@/lib/notify";
import { createPosting, fetchMyPostings, publishPosting, updatePosting } from "@/lib/postings";
import { uploadJobContract } from "@/lib/jobs";

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function readPostingIdFromSearch(): number {
  if (typeof window === "undefined") return 0;
  const raw = new URLSearchParams(window.location.search).get("postingId");
  const n = Number(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="block text-xs font-semibold text-[#73788b] dark:text-white/45 uppercase tracking-[0.14em]">
        {children}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {hint && (
        <span title={hint}>
          <HelpCircle size={11} className="text-[#9299ae] dark:text-white/30" />
        </span>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Icon size={14} className="text-violet-500" />
        </div>
        <h2 className="text-sm font-semibold text-[#11131b] dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function CreatePostingPage() {
  const router = useRouter();
  const [postingId, setPostingId] = useState(0);
  const isEditing = postingId > 0;
  const { address, isConnected } = useAccount();
  const { pageClass, mutedTextClass, titleClass, inputClass, textareaClass, chipClass, actionChipClass, isDarkTheme } = useThemeStyles();
  const profile = useLocalUserProfile(address);
  const canCreate = profile?.role === "employer" || profile?.role === "both";

  const session = useMemo(() => {
    if (!address) return null;
    const s = getStoredAuthSession();
    if (!s) return null;
    return s.walletAddress.toLowerCase() === address.toLowerCase() ? s : null;
  }, [address]);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("development");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [jobType, setJobType] = useState("fixed_price");
  const [budgetType, setBudgetType] = useState("fixed");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [timeline, setTimeline] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("intermediate");
  const [visibility, setVisibility] = useState("public");
  const [proposalDeadline, setProposalDeadline] = useState("");
  const [screeningQuestions, setScreeningQuestions] = useState<string[]>([""]);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    const id = readPostingIdFromSearch();
    setPostingId(id);
    if (id > 0) setIsLoading(true);
  }, []);

  useEffect(() => {
    async function load() {
      if (!isEditing || !address || !session) { setIsLoading(false); return; }
      setIsLoading(true);
      setError("");
      try {
        const postings = await fetchMyPostings(session);
        const found = postings.find((p) => p.id === postingId);
        if (!found) throw new Error("Posting not found.");
        setTitle(found.title);
        setSummary(found.summary ?? "");
        setDescription(found.description ?? "");
        setCategory(found.category);
        setSkills(found.skills);
        setJobType(found.jobType);
        setBudgetType(found.budgetType);
        setBudgetMin(found.budgetMin?.toString() ?? "");
        setBudgetMax(found.budgetMax?.toString() ?? "");
        setTimeline(found.timeline ?? "");
        setExperienceLevel(found.experienceLevel);
        setVisibility(found.visibility);
        setProposalDeadline(toLocalDateTimeValue(found.proposalDeadline));
        setScreeningQuestions(found.screeningQuestions.length > 0 ? found.screeningQuestions : [""]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load posting.";
        setError(msg);
        notifyError(msg);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [address, isEditing, postingId, session]);

  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  };

  const removeSkill = (skill: string) => setSkills((prev) => prev.filter((s) => s !== skill));

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(skillInput); }
    if (e.key === "Backspace" && !skillInput && skills.length > 0) removeSkill(skills[skills.length - 1]);
  };

  const addQuestion = () => setScreeningQuestions((prev) => [...prev, ""]);
  const removeQuestion = (i: number) => setScreeningQuestions((prev) => prev.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, val: string) => setScreeningQuestions((prev) => prev.map((q, idx) => idx === i ? val : q));

  const handleSave = async (nextAction: "draft" | "publish") => {
    setError("");
    if (!title.trim()) { setError("Job title is required."); return; }
    if (!session) { setError("Please sign in with your wallet first."); return; }
    if (!canCreate) { setError("Employer access is required."); return; }

    setIsSaving(true);
    try {
      let briefAttachmentKey: string | undefined;
      if (briefFile) {
        const upload = await uploadJobContract(session, briefFile);
        briefAttachmentKey = upload.key;
      }

      const payload = {
        title: title.trim(),
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        category,
        skills,
        jobType,
        budgetType,
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetType === "range" && budgetMax ? Number(budgetMax) : null,
        timeline: timeline.trim() || undefined,
        experienceLevel,
        visibility,
        proposalDeadline: proposalDeadline ? new Date(proposalDeadline).toISOString() : null,
        screeningQuestions: screeningQuestions.map((q) => q.trim()).filter(Boolean),
        briefAttachmentKey,
      };

      const posting = isEditing
        ? await updatePosting(session, postingId, payload)
        : await createPosting(session, payload);

      if (nextAction === "publish" && posting.status !== "Published") {
        await publishPosting(session, posting.id);
      }

      notifySuccess(nextAction === "publish" ? "Posting published." : "Draft saved.");
      router.push(`/postings/${posting.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save posting.";
      setError(msg);
      notifyError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const border = isDarkTheme ? "border-white/[0.07]" : "border-[#e5e8f2]";
  const subtle = isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]";
  const cardBg = isDarkTheme ? "bg-black/20" : "bg-white";
  const divider = isDarkTheme ? "divide-white/[0.06]" : "divide-[#f0f1f7]";

  // ── Guard states ──
  if (!isConnected) {
    return (
      <div className={pageClass}>
        <div className={`mx-auto max-w-lg rounded-2xl border p-8 text-center ${border} ${subtle}`}>
          <Briefcase className={`mx-auto h-8 w-8 ${mutedTextClass}`} />
          <p className={`mt-3 text-base font-semibold ${titleClass}`}>Connect your wallet</p>
          <p className={`mt-1 text-sm ${mutedTextClass}`}>You need a connected wallet to post a job.</p>
        </div>
      </div>
    );
  }

  if (!canCreate && profile) {
    return (
      <div className={pageClass}>
        <div className={`mx-auto max-w-lg rounded-2xl border p-8 text-center ${border} ${subtle}`}>
          <Settings className={`mx-auto h-8 w-8 ${mutedTextClass}`} />
          <p className={`mt-3 text-base font-semibold ${titleClass}`}>Employer access required</p>
          <p className={`mt-1 text-sm ${mutedTextClass}`}>
            Set your role to <strong>Employer</strong> or <strong>Both</strong> in profile settings.
          </p>
          <Link href="/settings/profile" className={`mt-5 inline-flex h-9 items-center rounded-xl px-4 text-sm font-semibold ${actionChipClass}`}>
            Open profile settings
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={pageClass}>
        <div className="mx-auto max-w-[820px] space-y-4">
          <div className={`h-8 w-48 animate-pulse rounded-xl ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`} />
          <div className={`h-96 animate-pulse rounded-2xl ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="mx-auto w-full max-w-[820px]">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/postings" className={`inline-flex items-center gap-1.5 text-sm transition hover:text-violet-500 ${mutedTextClass}`}>
            <ArrowLeft size={14} />
            Postings
          </Link>
          <span className={`text-sm ${mutedTextClass} opacity-40`}>/</span>
          <span className={`text-sm font-medium ${titleClass}`}>{isEditing ? "Edit posting" : "Create posting"}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">

          {/* ── Main form ── */}
          <div className={`divide-y rounded-2xl border ${border} ${cardBg} ${divider}`}>

            {/* Title area */}
            <div className="p-6">
              <h1 className={`text-xl font-bold ${titleClass}`}>
                {isEditing ? "Update job posting" : "Post a job"}
              </h1>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>
                Fill in the details below. You can save as a draft before publishing.
              </p>

              {error && (
                <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${isDarkTheme ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {error}
                </div>
              )}
            </div>

            {/* Section 1: Basics */}
            <div className="space-y-4 p-6">
              <Section icon={Briefcase} title="Job basics">
                <div className="space-y-4">
                  <div>
                    <FieldLabel required>Job title</FieldLabel>
                    <input
                      className={inputClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Senior React Developer for DeFi dashboard"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Shown on listing cards in the marketplace">Short summary</FieldLabel>
                    <input
                      className={inputClass}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="One-line summary for browse cards"
                    />
                  </div>
                  <div>
                    <FieldLabel>Full description</FieldLabel>
                    <textarea
                      className={`${textareaClass} min-h-36`}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the scope, deliverables, milestones, and what success looks like…"
                    />
                  </div>
                </div>
              </Section>
            </div>

            {/* Section 2: Classification */}
            <div className="space-y-4 p-6">
              <Section icon={Settings} title="Classification">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                      {MARKETPLACE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Experience level</FieldLabel>
                    <select className={inputClass} value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
                      {MARKETPLACE_EXPERIENCE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Job type</FieldLabel>
                    <select className={inputClass} value={jobType} onChange={(e) => setJobType(e.target.value)}>
                      {MARKETPLACE_JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Visibility</FieldLabel>
                    <select className={inputClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                      {MARKETPLACE_VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </Section>
            </div>

            {/* Section 3: Skills */}
            <div className="space-y-4 p-6">
              <Section icon={Tag} title="Required skills">
                <div>
                  {/* Tag input */}
                  <div className={`flex min-h-11 flex-wrap gap-2 rounded-xl border px-3 py-2 transition focus-within:border-violet-400/60 ${isDarkTheme ? "border-white/14 bg-black/40" : "border-[#e1e4f0] bg-white"}`}>
                    {skills.map((skill) => (
                      <span key={skill} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${chipClass}`}>
                        {skill}
                        <button type="button" onClick={() => removeSkill(skill)} className="hover:text-red-400 transition-colors">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <input
                      className={`min-w-32 flex-1 bg-transparent text-sm outline-none ${isDarkTheme ? "text-white placeholder:text-white/40" : "text-[#11131b] placeholder:text-[#73788b]"}`}
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleSkillKeyDown}
                      onBlur={() => addSkill(skillInput)}
                      placeholder={skills.length === 0 ? "Type a skill and press Enter…" : "Add more…"}
                    />
                  </div>
                  <p className={`mt-1.5 text-[11px] ${mutedTextClass}`}>Press Enter or comma to add. Backspace removes last.</p>

                  {/* Suggestions */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {MARKETPLACE_SUGGESTED_SKILLS.filter((s) => !skills.some((sk) => sk.toLowerCase() === s.toLowerCase())).map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => addSkill(skill)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${chipClass} hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-400/40 dark:hover:text-violet-300`}
                      >
                        + {skill}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            </div>

            {/* Section 4: Budget & timeline */}
            <div className="space-y-4 p-6">
              <Section icon={DollarSign} title="Budget & timeline">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Budget type</FieldLabel>
                    <select className={inputClass} value={budgetType} onChange={(e) => setBudgetType(e.target.value)}>
                      {MARKETPLACE_BUDGET_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel hint="e.g. 2 weeks, 1 month">Estimated timeline</FieldLabel>
                    <input className={inputClass} value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="2 weeks" />
                  </div>
                  <div>
                    <FieldLabel>{budgetType === "range" ? "Minimum budget (USDT)" : "Budget amount (USDT)"}</FieldLabel>
                    <div className="relative">
                      <DollarSign size={13} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextClass}`} />
                      <input className={`${inputClass} pl-8`} inputMode="decimal" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                  {budgetType === "range" && (
                    <div>
                      <FieldLabel>Maximum budget (USDT)</FieldLabel>
                      <div className="relative">
                        <DollarSign size={13} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextClass}`} />
                        <input className={`${inputClass} pl-8`} inputMode="decimal" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="0.00" />
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {/* Section 5: Application flow */}
            <div className="space-y-4 p-6">
              <Section icon={Calendar} title="Application settings">
                <div className="space-y-4">
                  <div>
                    <FieldLabel hint="Leave blank for no deadline">Proposal deadline</FieldLabel>
                    <input
                      className={inputClass}
                      type="datetime-local"
                      value={proposalDeadline}
                      onChange={(e) => setProposalDeadline(e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel hint="Optional questions applicants must answer">Screening questions</FieldLabel>
                    <div className="space-y-2">
                      {screeningQuestions.map((q, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            className={`${inputClass} flex-1`}
                            value={q}
                            onChange={(e) => updateQuestion(i, e.target.value)}
                            placeholder={`Question ${i + 1}…`}
                          />
                          {screeningQuestions.length > 1 && (
                            <button type="button" onClick={() => removeQuestion(i)} className={`flex size-11 shrink-0 items-center justify-center rounded-xl border transition ${isDarkTheme ? "border-white/10 text-white/40 hover:border-red-400/30 hover:text-red-400" : "border-[#e1e4f0] text-slate-400 hover:border-red-300 hover:text-red-500"}`}>
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addQuestion} className={`mt-2 text-xs font-medium transition hover:text-violet-500 ${mutedTextClass}`}>
                      + Add question
                    </button>
                  </div>
                </div>
              </Section>
            </div>

            {/* Section 6: Brief attachment */}
            <div className="p-6">
              <Section icon={FileText} title="Brief attachment (optional)">
                <div>
                  <FieldLabel hint="PDF file with detailed project requirements">Attach a brief (PDF)</FieldLabel>
                  <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition hover:border-violet-400/50 ${isDarkTheme ? "border-white/10 bg-white/[0.01] hover:bg-violet-500/5" : "border-[#e1e4f0] bg-[#fafbff] hover:bg-violet-50/30"}`}>
                    <FileText size={20} className={mutedTextClass} />
                    <span className={`text-sm font-medium ${titleClass}`}>
                      {briefFile ? briefFile.name : "Click to upload a PDF"}
                    </span>
                    <span className={`text-xs ${mutedTextClass}`}>PDF only · Max 10 MB</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) => setBriefFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {briefFile && (
                    <button type="button" onClick={() => setBriefFile(null)} className={`mt-2 text-xs ${mutedTextClass} hover:text-red-400 transition-colors`}>
                      Remove file
                    </button>
                  )}
                </div>
              </Section>
            </div>

            {/* Save actions */}
            <div className={`flex flex-wrap items-center gap-3 p-6`}>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSave("publish")}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold disabled:opacity-50 transition ${actionChipClass}`}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving…
                  </span>
                ) : (
                  <>
                    <Check size={15} />
                    {isEditing ? "Save changes" : "Publish posting"}
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSave("draft")}
                className={`inline-flex h-11 items-center rounded-xl px-5 text-sm font-medium disabled:opacity-50 transition ${chipClass}`}
              >
                Save as draft
              </button>
              <Link href="/postings" className={`ml-auto text-sm transition hover:text-violet-500 ${mutedTextClass}`}>
                Cancel
              </Link>
            </div>
          </div>

          {/* ── Right sidebar: tips ── */}
          <div className="hidden lg:block">
            <div className={`sticky top-6 rounded-2xl border p-5 space-y-5 ${border} ${isDarkTheme ? "bg-black/20" : "bg-white"}`}>
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>Tips</p>
                <p className={`mt-1 text-sm font-semibold ${titleClass}`}>Write a great posting</p>
              </div>

              <div className="space-y-3">
                {[
                  { tip: "Lead with the outcome, not just a task list." },
                  { tip: "Set a realistic budget — it filters for quality applicants." },
                  { tip: "3–6 focused skills beats a long tool list." },
                  { tip: "Add a brief PDF for complex scope." },
                  { tip: "Screening questions help you shortlist faster." },
                ].map(({ tip }, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isDarkTheme ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-500"}`}>
                      {i + 1}
                    </span>
                    <p className={`text-xs leading-5 ${mutedTextClass}`}>{tip}</p>
                  </div>
                ))}
              </div>

              <div className={`rounded-xl border p-3 ${border} ${isDarkTheme ? "bg-white/[0.02]" : "bg-[#f8f9fc]"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${mutedTextClass}`}>Workflow</p>
                <div className={`mt-2 space-y-1.5 text-xs ${mutedTextClass}`}>
                  <p>1. Save as draft</p>
                  <p>2. Publish to receive proposals</p>
                  <p>3. Review &amp; shortlist</p>
                  <p>4. Send a job offer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
