"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import FreeTriesModal from "@/components/public/free-tries-modal";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { evaluatePublicContractText, PublicRateLimitError } from "@/lib/public-services";

type EvaluatedClause = {
  id: string;
  text: string;
  label: string;
  confidence: number | null;
  suggestion: string;
  reason: string;
};

const DEFAULT_UNFAIR_CLAUSE =
  "Client may terminate this contract at any time, keep all completed work, and withhold payment for work already performed.";

function formatDate(value: string) {
  if (!value) return "N/A";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function safeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "job-contract";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseScore(payload: Record<string, unknown>) {
  const raw = payload.fairness_score ?? payload.fairnessScore ?? payload.score ?? payload.overall_score;
  if (typeof raw !== "number") return null;
  return Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
}

function parseClauses(payload: Record<string, unknown>): EvaluatedClause[] {
  const raw = payload.clauses ?? payload.analysis ?? payload.results;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index) => {
      const confidenceRaw = item.confidence;
      const confidence =
        typeof confidenceRaw === "number"
          ? Math.max(0, Math.min(100, confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw))
          : null;

      return {
        id: `clause-${index + 1}`,
        text:
          (typeof item.clause === "string" && item.clause) ||
          (typeof item.text === "string" && item.text) ||
          `Clause ${index + 1}`,
        label:
          (typeof item.label === "string" && item.label) ||
          (typeof item.verdict === "string" && item.verdict) ||
          "fair",
        confidence,
        suggestion:
          (typeof item.suggestion === "string" && item.suggestion) ||
          (typeof item.recommendation === "string" && item.recommendation) ||
          "",
        reason:
          (typeof item.reason === "string" && item.reason) ||
          (typeof item.issue === "string" && item.issue) ||
          "",
      };
    });
}

export default function PublicContractBuilderPage() {
  const {
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
    inputClass,
    textareaClass,
    isDarkTheme,
  } = useThemeStyles();

  const [jobTitle, setJobTitle] = useState("Website redesign sprint");
  const [clientName, setClientName] = useState("Sample Client Co.");
  const [freelancerName, setFreelancerName] = useState("Freelancer Name");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("500");
  const [scope, setScope] = useState(
    "Freelancer will design and implement a responsive marketing landing page, provide source files, and complete one handoff call."
  );
  const [deliverables, setDeliverables] = useState<string[]>([
    "Responsive landing page implementation",
    "Final source files and deployment notes",
  ]);
  const [clauses, setClauses] = useState<string[]>([DEFAULT_UNFAIR_CLAUSE]);
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [findings, setFindings] = useState<EvaluatedClause[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showRateLimitModal, setShowRateLimitModal] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const contractText = useMemo(() => {
    const filledDeliverables = deliverables.map((item) => item.trim()).filter(Boolean);
    const filledClauses = clauses.map((item) => item.trim()).filter(Boolean);
    return [
      "FREELANCE JOB CONTRACT",
      "",
      `This Job Contract is made between ${clientName || "Client"} and ${freelancerName || "Freelancer"}.`,
      "",
      `1. Project. ${jobTitle || "Untitled project"}`,
      `2. Scope of Work. ${scope || "No scope provided."}`,
      `3. Timeline. Work begins on ${formatDate(startDate)} and ends on ${formatDate(endDate)}.`,
      `4. Compensation. Client shall pay ${amount || "0"} USDT for the services described in this contract.`,
      "",
      "5. Deliverables.",
      ...filledDeliverables.map((item, index) => `${index + 1}. ${item}`),
      "",
      "6. Additional Clauses.",
      ...filledClauses.map((item, index) => `${index + 1}. ${item}`),
      "",
      "CLIENT SIGNATURE: ________________________________ DATE: ____________",
      "",
      "FREELANCER SIGNATURE: ____________________________ DATE: ____________",
    ].join("\n");
  }, [amount, clauses, clientName, deliverables, endDate, freelancerName, jobTitle, scope, startDate]);

  function updateList(
    setter: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string
  ) {
    setter((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function removeListItem(setter: Dispatch<SetStateAction<string[]>>, index: number) {
    setter((previous) => (previous.length === 1 ? [""] : previous.filter((_, itemIndex) => itemIndex !== index)));
  }

  function validate() {
    const missing: string[] = [];
    if (!jobTitle.trim()) missing.push("Project title is required.");
    if (!clientName.trim()) missing.push("Client name is required.");
    if (!freelancerName.trim()) missing.push("Freelancer name is required.");
    if (!scope.trim()) missing.push("Scope of work is required.");
    if (!(Number(amount) > 0)) missing.push("Amount must be greater than 0.");
    if (deliverables.every((item) => !item.trim())) {
      missing.push("At least one deliverable is required.");
    }

    setError(missing[0] || "");
    return missing.length === 0;
  }

  async function reviewContract() {
    if (!validate()) return;

    setError("");
    setScore(null);
    setFindings([]);
    setIsReviewing(true);

    try {
      const payload = await evaluatePublicContractText(contractText);
      setScore(parseScore(payload));
      setFindings(parseClauses(payload));
    } catch (reviewError) {
      if (reviewError instanceof PublicRateLimitError) {
        setShowRateLimitModal(true);
      } else {
        setError(reviewError instanceof Error ? reviewError.message : "AI review failed.");
      }
    } finally {
      setIsReviewing(false);
    }
  }

  async function exportDocx() {
    if (!validate()) return;

    setIsExportingDocx(true);
    try {
      const { Document, Packer, Paragraph, TextRun } = await import("docx");
      const paragraphs = contractText.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line || " ", bold: line === "FREELANCE JOB CONTRACT" })],
          })
      );
      const docxDocument = new Document({ sections: [{ children: paragraphs }] });
      downloadBlob(await Packer.toBlob(docxDocument), `${safeFileName(jobTitle)}.docx`);
    } finally {
      setIsExportingDocx(false);
    }
  }

  async function exportPdf() {
    if (!validate()) return;

    setIsExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const margin = 56;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let y = margin;

      pdf.setFont("times", "normal");
      pdf.setFontSize(11);
      for (const paragraph of contractText.split("\n")) {
        const lines = pdf.splitTextToSize(paragraph || " ", pageWidth - margin * 2) as string[];
        for (const line of lines) {
          if (y > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 16;
        }
        y += 4;
      }

      downloadBlob(pdf.output("blob"), `${safeFileName(jobTitle)}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  }

  const scoreColor =
    score === null
      ? mutedTextClass
      : score >= 75
        ? "text-emerald-500"
        : score >= 50
          ? "text-amber-500"
          : "text-red-500";

  return (
    <div className={`mx-auto min-h-screen w-full max-w-6xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
              Public contract builder
            </span>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Build a job contract before signing in
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Draft a freelance contract, export it as PDF or DOCX, and use the limited anonymous AI review to test for unfair clauses.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`${chipClass} rounded-full px-3 py-2`}>3 AI checks per day</span>
            <Link href="/public" className={`${chipClass} rounded-full px-3 py-2 transition hover:border-violet-300 hover:bg-violet-500/10`}>
              Public services
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.58fr_0.42fr]">
        <div className={`${panelClass} rounded-2xl p-6`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Project title</span>
              <input className={inputClass} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
            </label>
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Amount (USDT)</span>
              <input className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Client</span>
              <input className={inputClass} value={clientName} onChange={(event) => setClientName(event.target.value)} />
            </label>
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Freelancer</span>
              <input className={inputClass} value={freelancerName} onChange={(event) => setFreelancerName(event.target.value)} />
            </label>
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Start date</span>
              <input type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="block">
              <span className={`mb-2 block text-sm font-medium ${titleClass}`}>End date</span>
              <input type="date" className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>

          <label className="mt-4 block">
            <span className={`mb-2 block text-sm font-medium ${titleClass}`}>Scope of work</span>
            <textarea className={textareaClass} value={scope} onChange={(event) => setScope(event.target.value)} />
          </label>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className={`text-lg font-semibold ${titleClass}`}>Deliverables</h2>
              <button type="button" className={`${chipClass} inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm`} onClick={() => setDeliverables((previous) => [...previous, ""])}>
                <Plus size={15} />
                Add
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {deliverables.map((item, index) => (
                <div key={`deliverable-${index}`} className="flex gap-2">
                  <input className={inputClass} value={item} onChange={(event) => updateList(setDeliverables, index, event.target.value)} />
                  <button type="button" className={`${chipClass} inline-flex size-11 shrink-0 items-center justify-center rounded-xl`} onClick={() => removeListItem(setDeliverables, index)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className={`text-lg font-semibold ${titleClass}`}>Additional clauses</h2>
              <button type="button" className={`${chipClass} inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm`} onClick={() => setClauses((previous) => [...previous, ""])}>
                <Plus size={15} />
                Add
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {clauses.map((item, index) => (
                <div key={`clause-${index}`} className="flex items-start gap-2">
                  <textarea className={`${textareaClass} min-h-24`} value={item} onChange={(event) => updateList(setClauses, index, event.target.value)} />
                  <button type="button" className={`${chipClass} mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-xl`} onClick={() => removeListItem(setClauses, index)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className={`${panelClass} rounded-2xl p-6`}>
          <h2 className={`text-lg font-semibold ${titleClass}`}>Preview and export</h2>
          <pre className={`${subtlePanelClass} mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl p-4 text-xs leading-6 ${mutedTextClass}`}>
            {contractText}
          </pre>

          <div className="mt-5 grid gap-3">
            <button type="button" className={`${actionChipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`} disabled={isReviewing} onClick={() => void reviewContract()}>
              {isReviewing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isReviewing ? "Checking..." : "Run AI fairness check"}
            </button>
            <button type="button" className={`${chipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`} onClick={() => setShowPreview(true)}>
              <Eye size={16} />
              Open preview
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" className={`${chipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`} disabled={isExportingPdf} onClick={() => void exportPdf()}>
                {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                PDF
              </button>
              <button type="button" className={`${chipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`} disabled={isExportingDocx} onClick={() => void exportDocx()}>
                {isExportingDocx ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                DOCX
              </button>
            </div>
          </div>

          {score !== null ? (
            <div className={`${subtlePanelClass} mt-5 rounded-2xl p-5`}>
              <p className={`text-sm font-medium ${mutedTextClass}`}>Fairness score</p>
              <p className={`mt-1 text-4xl font-semibold ${scoreColor}`}>{score.toFixed(0)}%</p>
            </div>
          ) : null}
        </aside>
      </section>

      {findings.length > 0 ? (
        <section className={`${panelClass} mt-6 rounded-2xl p-6`}>
          <h2 className={`text-lg font-semibold ${titleClass}`}>AI clause findings</h2>
          <div className="mt-4 grid gap-3">
            {findings.map((item, index) => {
              const fair = item.label.toLowerCase() === "fair" || item.label.toLowerCase() === "safe";
              return (
                <div key={item.id} className={`rounded-2xl border p-4 ${fair ? "border-emerald-300/40 bg-emerald-500/5" : "border-red-300/40 bg-red-500/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${titleClass}`}>Clause {index + 1}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${fair ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                      {fair ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                      {fair ? "Fair" : "Needs review"}
                    </span>
                  </div>
                  <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${mutedTextClass}`}>{item.text}</p>
                  {item.reason ? <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>{item.reason}</p> : null}
                  {item.suggestion ? (
                    <p className={`mt-3 rounded-xl p-3 text-sm leading-6 ${isDarkTheme ? "bg-violet-500/10 text-violet-100" : "bg-violet-50 text-violet-900"}`}>
                      {item.suggestion}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {showPreview ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className={`${panelClass} relative max-h-[84vh] w-full max-w-3xl overflow-hidden rounded-2xl`}>
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h2 className={`text-lg font-semibold ${titleClass}`}>Contract preview</h2>
              <button type="button" className={`${chipClass} rounded-xl px-4 py-2 text-sm`} onClick={() => setShowPreview(false)}>
                Close
              </button>
            </div>
            <pre className={`max-h-[68vh] overflow-auto whitespace-pre-wrap p-6 text-sm leading-7 ${mutedTextClass}`}>{contractText}</pre>
          </div>
        </div>
      ) : null}

      <FreeTriesModal
        open={showRateLimitModal}
        onClose={() => setShowRateLimitModal(false)}
        title="Contract builder free tries used"
      />
    </div>
  );
}
