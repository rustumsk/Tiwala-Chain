"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { useAccount } from "wagmi";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { getStoredProfile } from "@/lib/profile";

type EvaluatedClause = {
  id: string;
  clauseNumber: number;
  text: string;
  isFair: boolean;
  confidence: number | null;
  suggestion: string;
  dismissed: boolean;
  applied: boolean;
};

const STANDARD_CONFIDENTIALITY =
  "Both parties agree not to disclose confidential information, business data, credentials, or files shared during this contract without prior written consent.";

const PAYMENT_TERMS_LABEL = "100% on completion";

function walletLooksValid(wallet: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(wallet.trim());
}

function toSafeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatDate(value: string) {
  if (!value) return "N/A";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function parseScore(payload: Record<string, unknown>): number | null {
  const direct = payload.fairness_score ?? payload.overall_score ?? payload.score;
  if (typeof direct === "number") return Math.max(0, Math.min(100, direct));
  return null;
}

function parseClauseResults(payload: Record<string, unknown>) {
  const raw = payload.clauses ?? payload.analysis ?? payload.results;
  if (!Array.isArray(raw)) return [] as Array<Record<string, unknown>>;
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

async function sha256HexFromArrayBuffer(buffer: ArrayBuffer) {
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CreateContractPage() {
  const { address, isConnected } = useAccount();

  // Common fields
  const [jobTitle, setJobTitle] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerWallet, setFreelancerWallet] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confidentialityEnabled, setConfidentialityEnabled] = useState(true);
  const [customClauses, setCustomClauses] = useState<string[]>([""]);

  // Contract payment fields
  const [totalAmountUsdt, setTotalAmountUsdt] = useState("");
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [revisionRounds, setRevisionRounds] = useState("");

  // Evaluation + download state
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [fairnessScore, setFairnessScore] = useState<number | null>(null);
  const [evaluatedClauses, setEvaluatedClauses] = useState<EvaluatedClause[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [lastFileHash, setLastFileHash] = useState("");
  const [copiedHash, setCopiedHash] = useState(false);

  const allClausesForContract = useMemo(() => {
    const clauses: string[] = [];
    if (confidentialityEnabled) clauses.push(STANDARD_CONFIDENTIALITY);
    customClauses
      .map((clause) => clause.trim())
      .filter(Boolean)
      .forEach((clause) => clauses.push(clause));
    return clauses;
  }, [confidentialityEnabled, customClauses]);

  const hasUnfairClause = evaluatedClauses.some((clause) => !clause.isFair);
  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase() ? stored : null;
  }, [address, isConnected]);
  const canUseContractBuilder =
    profile?.role === "employer" || profile?.role === "both";

  const validateForm = () => {
    const errors: string[] = [];

    if (!jobTitle.trim()) errors.push("Job title is required.");
    if (!employerName.trim()) errors.push("Employer name or company is required.");
    if (!freelancerName.trim()) errors.push("Freelancer name is required.");
    if (!walletLooksValid(freelancerWallet)) {
      errors.push("Freelancer wallet must start with 0x and be a valid 42-character address.");
    }
    if (!projectDescription.trim()) errors.push("Project description is required.");
    if (!startDate) errors.push("Start date is required.");
    if (!endDate) errors.push("End date is required.");
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errors.push("End date must be on or after start date.");
    }

    if (!(Number(totalAmountUsdt) > 0)) errors.push("Total amount in USDT must be greater than 0.");
    if (deliverables.every((item) => !item.trim())) {
      errors.push("At least one deliverable is required.");
    }
    if (!(Number(revisionRounds) >= 0)) {
      errors.push("Number of revision rounds must be 0 or greater.");
    }

    setFormErrors(errors);
    return errors.length === 0;
  };

  const buildContractLines = () => {
    const lines: string[] = [];
    lines.push("Freelancing Contract");
    lines.push("");
    lines.push(`Job Title: ${jobTitle}`);
    lines.push(`Employer: ${employerName}`);
    lines.push(`Freelancer: ${freelancerName}`);
    lines.push(`Freelancer Wallet: ${freelancerWallet}`);
    lines.push(`Start Date: ${formatDate(startDate)}`);
    lines.push(`End Date: ${formatDate(endDate)}`);
    lines.push("");
    lines.push("Project Description");
    lines.push(projectDescription);
    lines.push("");

    lines.push("Compensation and Deliverables");
    lines.push(`Total Amount in USDT: ${totalAmountUsdt}`);
    lines.push(`Revision Rounds: ${revisionRounds}`);
    lines.push(`Payment Terms: ${PAYMENT_TERMS_LABEL}`);
    lines.push("Deliverables:");
    deliverables
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item, index) => lines.push(`${index + 1}. ${item}`));

    lines.push("");
    lines.push("Clauses");
    allClausesForContract.forEach((clause, index) => {
      lines.push(`${index + 1}. ${clause}`);
    });
    lines.push("");
    lines.push("Signature Lines");
    lines.push("Employer Signature: ______________________________");
    lines.push("Freelancer Signature: ____________________________");
    lines.push(`Date Generated: ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push("Generated by TiwalaChain — Blockchain Freelancing Platform");

    return lines;
  };

  const compiledContractText = buildContractLines().join("\n");

  const updateArrayValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const removeArrayValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => {
      if (prev.length === 1) return [""];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const evaluateFairness = async () => {
    if (!validateForm()) return;

    setEvaluationError("");
    setIsEvaluating(true);
    setCopiedHash(false);

    try {
      const response = await fetch("http://localhost:8000/evaluate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: compiledContractText }),
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(details?.error ?? `AI evaluation failed (${response.status}).`);
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const parsedScore = parseScore(payload);
      const parsedClauses = parseClauseResults(payload);
      setFairnessScore(parsedScore);

      const fallbackClauses = allClausesForContract.map((text, index) => ({
        id: `clause-${index + 1}`,
        clauseNumber: index + 1,
        text,
        isFair: true,
        confidence: null,
        suggestion: "",
        dismissed: false,
        applied: false,
      }));

      const normalized =
        parsedClauses.length > 0
          ? parsedClauses.map((item, index) => {
              const label =
                (typeof item.label === "string" && item.label.toLowerCase()) ||
                (typeof item.verdict === "string" && item.verdict.toLowerCase()) ||
                "";
              const isFair =
                label === "fair" ||
                label === "safe" ||
                item.is_fair === true ||
                item.isFair === true;

              const text =
                (typeof item.clause === "string" && item.clause) ||
                (typeof item.text === "string" && item.text) ||
                allClausesForContract[index] ||
                `${index + 1}.`;

              const confidenceRaw = item.confidence;
              const confidence =
                typeof confidenceRaw === "number"
                  ? Math.max(0, Math.min(100, confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw))
                  : null;

              const suggestion =
                (typeof item.suggestion === "string" && item.suggestion) ||
                (typeof item.recommendation === "string" && item.recommendation) ||
                "";

              return {
                id: `result-${index + 1}`,
                clauseNumber: index + 1,
                text,
                isFair,
                confidence,
                suggestion,
                dismissed: false,
                applied: false,
              };
            })
          : fallbackClauses;

      setEvaluatedClauses(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown evaluation error.";
      setEvaluationError(message);
      setFairnessScore(null);
      setEvaluatedClauses([]);
    } finally {
      setIsEvaluating(false);
    }
  };

  const applySuggestion = (item: EvaluatedClause) => {
    if (!item.suggestion.trim()) return;

    setCustomClauses((prev) => {
      const offset = confidentialityEnabled ? 1 : 0;
      const customIndex = item.clauseNumber - 1 - offset;
      if (customIndex < 0 || customIndex >= prev.length) return prev;
      return prev.map((clause, idx) => (idx === customIndex ? item.suggestion : clause));
    });

    setEvaluatedClauses((prev) =>
      prev.map((clause) =>
        clause.id === item.id
          ? { ...clause, text: item.suggestion, dismissed: false, applied: true }
          : clause
      )
    );
  };

  const keepOriginal = (itemId: string) => {
    setEvaluatedClauses((prev) =>
      prev.map((clause) =>
        clause.id === itemId ? { ...clause, dismissed: true, applied: false } : clause
      )
    );
  };

  const renderProgressColor = () => {
    if (fairnessScore === null) return "bg-slate-600";
    if (fairnessScore > 70) return "bg-emerald-500";
    if (fairnessScore >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  const stepRail = [
    { step: "01", title: "Compose", subtitle: "Fill terms and clauses" },
    { step: "02", title: "Review", subtitle: "Run AI fairness checks" },
    { step: "03", title: "Export", subtitle: "Generate signed-ready file" },
  ];

  const exportPdf = async () => {
    if (!validateForm()) return;

    setIsExportingPdf(true);
    setCopiedHash(false);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const marginX = 56;
      const topMargin = 56;
      const bottomMargin = 58;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - marginX * 2;
      let y = topMargin;

      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - bottomMargin) {
          pdf.addPage();
          y = topMargin;
        }
      };

      const writeWrappedText = (
        text: string,
        {
          fontSize = 11,
          lineHeight = 16,
          fontStyle = "normal",
          color = [20, 24, 36] as [number, number, number],
          indent = 0,
        }: {
          fontSize?: number;
          lineHeight?: number;
          fontStyle?: "normal" | "bold";
          color?: [number, number, number];
          indent?: number;
        } = {}
      ) => {
        pdf.setFont("helvetica", fontStyle);
        pdf.setFontSize(fontSize);
        pdf.setTextColor(...color);
        const wrapped = pdf.splitTextToSize(text || " ", contentWidth - indent) as string[];
        ensureSpace(wrapped.length * lineHeight + 2);
        wrapped.forEach((line) => {
          pdf.text(line, marginX + indent, y);
          y += lineHeight;
        });
      };

      const drawSectionTitle = (title: string) => {
        ensureSpace(36);
        pdf.setDrawColor(226, 229, 238);
        pdf.line(marginX, y, pageWidth - marginX, y);
        y += 16;
        writeWrappedText(title, {
          fontSize: 11,
          lineHeight: 15,
          fontStyle: "bold",
          color: [91, 43, 163],
        });
        y += 2;
      };

      const drawField = (label: string, value: string) => {
        writeWrappedText(`${label}:`, {
          fontSize: 10,
          lineHeight: 14,
          fontStyle: "bold",
          color: [86, 93, 114],
        });
        writeWrappedText(value || "N/A", {
          fontSize: 11,
          lineHeight: 16,
          color: [20, 24, 36],
          indent: 10,
        });
        y += 2;
      };

      const drawBulletList = (items: string[]) => {
        items.forEach((item) => {
          writeWrappedText(`• ${item}`, {
            fontSize: 11,
            lineHeight: 16,
            color: [20, 24, 36],
            indent: 8,
          });
        });
      };

      // Header
      writeWrappedText("Freelancing Contract", {
        fontSize: 16,
        lineHeight: 20,
        fontStyle: "bold",
        color: [22, 26, 38],
      });
      writeWrappedText(`Date Generated: ${new Date().toLocaleString()}`, {
        fontSize: 10,
        lineHeight: 14,
        color: [107, 115, 137],
      });
      y += 8;

      drawSectionTitle("Contract Overview");
      drawField("Job Title", jobTitle);
      drawField("Start Date", formatDate(startDate));
      drawField("End Date", formatDate(endDate));

      drawSectionTitle("Parties");
      drawField("Employer", employerName);
      drawField("Freelancer", freelancerName);
      drawField("Freelancer Wallet", freelancerWallet);

      drawSectionTitle("Scope of Work");
      writeWrappedText(projectDescription || "No project description provided.", {
        fontSize: 11,
        lineHeight: 17,
      });
      y += 4;

      drawSectionTitle("Compensation and Deliverables");
      drawField("Total Amount in USDT", totalAmountUsdt);
      drawField("Revision Rounds", revisionRounds);
      drawField("Payment Terms", PAYMENT_TERMS_LABEL);
      writeWrappedText("Deliverables:", {
        fontSize: 10,
        lineHeight: 14,
        fontStyle: "bold",
        color: [86, 93, 114],
      });
      drawBulletList(deliverables.map((item) => item.trim()).filter(Boolean));

      drawSectionTitle("Contract Clauses");
      if (allClausesForContract.length === 0) {
        writeWrappedText("No additional clauses provided.", {
          fontSize: 11,
          lineHeight: 16,
          color: [96, 103, 124],
        });
      } else {
        allClausesForContract.forEach((clause, index) => {
          writeWrappedText(`${index + 1}.`, {
            fontSize: 10,
            lineHeight: 14,
            fontStyle: "bold",
            color: [86, 93, 114],
          });
          writeWrappedText(clause, { fontSize: 11, lineHeight: 16, indent: 10 });
          y += 2;
        });
      }

      if (fairnessScore !== null) {
        drawSectionTitle("AI Fairness Summary");
        writeWrappedText(`Fairness Score: ${fairnessScore.toFixed(1)} / 100`, {
          fontSize: 11,
          lineHeight: 16,
          fontStyle: "bold",
        });
        if (hasUnfairClause) {
          writeWrappedText(
            "One or more clauses were flagged as potentially unfair. Please review suggestions before final signature.",
            { fontSize: 10, lineHeight: 15, color: [150, 87, 0] }
          );
        } else {
          writeWrappedText("No high-risk clauses flagged during evaluation.", {
            fontSize: 10,
            lineHeight: 15,
            color: [16, 128, 86],
          });
        }
      }

      drawSectionTitle("Signatures");
      ensureSpace(90);
      pdf.setDrawColor(164, 169, 183);
      pdf.line(marginX, y + 30, marginX + 220, y + 30);
      pdf.line(pageWidth - marginX - 220, y + 30, pageWidth - marginX, y + 30);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(86, 93, 114);
      pdf.text("Employer Signature", marginX, y + 46);
      pdf.text("Freelancer Signature", pageWidth - marginX - 220, y + 46);
      y += 70;

      writeWrappedText("Generated by TiwalaChain - Blockchain Freelancing Platform", {
        fontSize: 9,
        lineHeight: 13,
        color: [115, 122, 142],
      });

      // Footer page numbers
      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(124, 131, 151);
        pdf.text(
          `Page ${page} of ${totalPages}`,
          pageWidth - marginX,
          pageHeight - 24,
          { align: "right" }
        );
      }

      const arrayBuffer = pdf.output("arraybuffer");
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const fileName = `${toSafeFileName(jobTitle || "job-contract") || "job-contract"}.pdf`;
      downloadBlob(blob, fileName);

      const hash = await sha256HexFromArrayBuffer(arrayBuffer);
      setLastFileHash(hash);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportDocx = async () => {
    if (!validateForm()) return;

    setIsExportingDocx(true);
    setCopiedHash(false);
    try {
      const lines = buildContractLines();
      const children = lines.map((line, index) => {
        const heading =
          index === 0
            ? HeadingLevel.HEADING_1
            : line === "Project Description" ||
                line === "Compensation and Deliverables" ||
                line === "Clauses" ||
                line === "Signature Lines"
              ? HeadingLevel.HEADING_3
              : undefined;

        return new Paragraph({
          heading,
          alignment: index === 0 ? AlignmentType.CENTER : undefined,
          children: [new TextRun(line || " ")],
          spacing: { after: 120 },
        });
      });

      const doc = new Document({
        sections: [{ children }],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `${toSafeFileName(jobTitle || "job-contract") || "job-contract"}.docx`;
      downloadBlob(blob, fileName);

      const hash = await sha256HexFromArrayBuffer(await blob.arrayBuffer());
      setLastFileHash(hash);
    } finally {
      setIsExportingDocx(false);
    }
  };

  const copyHash = async () => {
    if (!lastFileHash) return;
    await navigator.clipboard.writeText(lastFileHash);
    setCopiedHash(true);
  };

  if (!canUseContractBuilder) {
    return (
      <div className="themed-app-page text-slate-100 contract-builder-page">
        <section className="mx-auto w-full max-w-4xl space-y-6">
          <article className="workspace-panel p-8">
            <h1 className="text-2xl font-semibold">Employer Access Required</h1>
            <p className="mt-2 text-sm text-slate-300">
              Contract Builder is only available for Employer or Both roles.
            </p>
            <Link
              href="/settings/profile"
              className="mt-5 inline-flex h-10 items-center rounded-full border border-violet-300/20 bg-violet-500/10 px-4 text-sm text-violet-100 transition hover:border-violet-300/40"
            >
              Update Profile Settings
            </Link>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="themed-app-page text-slate-100 contract-builder-page">
      <section className="mx-auto w-full max-w-[1080px] space-y-5">
        <article className="workspace-panel space-y-5 p-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contract Builder</h1>
            <p className="mt-2 text-sm text-slate-300">
              Draft a clean agreement, validate fairness, then export a professional contract file for your escrow job.
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2 md:grid-cols-3">
            {stepRail.map((item) => (
              <div
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-3"
                key={item.step}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/90">
                  Step {item.step}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{item.title}</p>
                <p className="mt-1 text-xs text-slate-400">{item.subtitle}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-panel p-8">
          <h2 className="text-lg font-semibold">Step 1 — Fill Contract Form</h2>
          <p className="mt-2 text-xs text-slate-400">
            Date inputs are currently native date fields to keep dependencies minimal.
          </p>

          {formErrors.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">Please fix the following:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
                {formErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-200">Job Title</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                onChange={(event) => setJobTitle(event.target.value)}
                value={jobTitle}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">Employer Name or Company</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                onChange={(event) => setEmployerName(event.target.value)}
                value={employerName}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">Freelancer Name</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                onChange={(event) => setFreelancerName(event.target.value)}
                value={freelancerName}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">Freelancer Wallet Address</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 font-mono outline-none focus:border-violet-300"
                onChange={(event) => setFreelancerWallet(event.target.value)}
                placeholder="0x..."
                value={freelancerWallet}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">Start Date</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">End Date</label>
              <input
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm text-slate-200">Project Description</label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 outline-none focus:border-violet-300"
              onChange={(event) => setProjectDescription(event.target.value)}
              value={projectDescription}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm font-medium text-slate-200">Confidentiality Clause</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  confidentialityEnabled
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700 text-slate-300"
                }`}
                onClick={() => setConfidentialityEnabled(true)}
                type="button"
              >
                Yes
              </button>
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  !confidentialityEnabled
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700 text-slate-300"
                }`}
                onClick={() => setConfidentialityEnabled(false)}
                type="button"
              >
                No
              </button>
            </div>
            {confidentialityEnabled ? (
              <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">
                {STANDARD_CONFIDENTIALITY}
              </p>
            ) : null}
          </div>

          <div className="mt-5 space-y-4 rounded-xl border border-violet-400/20 bg-violet-500/5 p-4">
            <h3 className="font-semibold text-violet-100">Compensation and Deliverables</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-200">Total Amount in USDT</label>
                <input
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                  min="0"
                  onChange={(event) => setTotalAmountUsdt(event.target.value)}
                  step="0.01"
                  type="number"
                  value={totalAmountUsdt}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-200">Number of Revision Rounds</label>
                <input
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 outline-none focus:border-violet-300"
                  min="0"
                  onChange={(event) => setRevisionRounds(event.target.value)}
                  type="number"
                  value={revisionRounds}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-200">Payment Terms</label>
              <p className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                100% on completion
              </p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm text-slate-200">Deliverables</label>
                <button
                  className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200"
                  onClick={() => setDeliverables((prev) => [...prev, ""])}
                  type="button"
                >
                  Add Deliverable
                </button>
              </div>
              <div className="space-y-2">
                {deliverables.map((item, index) => (
                  <div className="flex items-start gap-2" key={`deliverable-${index}`}>
                    <span className="mt-3 min-w-8 text-sm text-slate-400">{index + 1}.</span>
                    <textarea
                      className="min-h-20 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 outline-none focus:border-violet-300"
                      onChange={(event) =>
                        updateArrayValue(setDeliverables, index, event.target.value)
                      }
                      value={item}
                    />
                    <button
                      className="mt-2 rounded-lg border border-red-400/30 px-3 py-1 text-xs text-red-200"
                      onClick={() => removeArrayValue(setDeliverables, index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">Dynamic Clauses</h3>
              <button
                className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200"
                onClick={() => setCustomClauses((prev) => [...prev, ""])}
                type="button"
              >
                Add Clause
              </button>
            </div>
            <div className="space-y-3">
              {customClauses.map((clause, index) => (
                <div className="flex items-start gap-2" key={`custom-clause-${index}`}>
                  <span className="mt-3 min-w-8 text-sm text-slate-400">{index + 1}.</span>
                  <textarea
                    className="min-h-24 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 outline-none focus:border-violet-300"
                    onChange={(event) => updateArrayValue(setCustomClauses, index, event.target.value)}
                    value={clause}
                  />
                  <button
                    className="mt-2 rounded-lg border border-red-400/30 px-3 py-1 text-xs text-red-200"
                    onClick={() => removeArrayValue(setCustomClauses, index)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="workspace-panel p-8">
          <h2 className="text-lg font-semibold">Step 2 — AI Fairness Evaluation</h2>
          <button
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isEvaluating}
            onClick={evaluateFairness}
            type="button"
          >
            {isEvaluating ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                Evaluating...
              </span>
            ) : (
              "Evaluate Contract Fairness"
            )}
          </button>

          {evaluationError ? (
            <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {evaluationError}
            </p>
          ) : null}

          {fairnessScore !== null ? (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-slate-100">
                Overall Fairness Score: {fairnessScore.toFixed(1)}%
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full ${renderProgressColor()}`}
                  style={{ width: `${Math.max(0, Math.min(100, fairnessScore))}%` }}
                />
              </div>
            </div>
          ) : null}

          {hasUnfairClause ? (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Warning: One or more clauses were flagged as potentially unfair.
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {evaluatedClauses.map((item) => (
              <div
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{item.clauseNumber}.</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        item.isFair
                          ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          : "border border-red-400/40 bg-red-500/10 text-red-200"
                      }`}
                    >
                      {item.isFair ? "Fair" : "Unfair"}
                    </span>
                    <span className="text-xs text-slate-400">
                      Confidence: {item.confidence !== null ? `${item.confidence.toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{item.text}</p>

                {!item.isFair && item.suggestion && !item.dismissed ? (
                  <div className="mt-3 rounded-lg border border-violet-400/40 bg-violet-500/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
                      Suggested safer wording
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-violet-100">{item.suggestion}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          item.applied
                            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                            : "border-violet-400/40 bg-violet-500/10 text-violet-100"
                        }`}
                        onClick={() => applySuggestion(item)}
                        type="button"
                      >
                        {item.applied ? "Suggestion Applied ✓" : "Apply Suggestion"}
                      </button>
                      <button
                        className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300"
                        onClick={() => keepOriginal(item.id)}
                        type="button"
                      >
                        Keep Original
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-panel p-8">
          <h2 className="text-lg font-semibold">Step 3 — Download Contract</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="inline-flex h-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-400/10 px-5 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExportingPdf}
              onClick={exportPdf}
              type="button"
            >
              {isExportingPdf ? "Generating PDF..." : "Download as PDF"}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-400/10 px-5 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExportingDocx}
              onClick={exportDocx}
              type="button"
            >
              {isExportingDocx ? "Generating DOCX..." : "Download as DOCX"}
            </button>
          </div>

          {lastFileHash ? (
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-slate-100">SHA-256 File Hash</p>
              <p className="mt-2 break-all rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs text-slate-200">
                {lastFileHash}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
                  onClick={copyHash}
                  type="button"
                >
                  {copiedHash ? "Copied ✓" : "Copy Hash"}
                </button>
                <p className="text-xs text-amber-200">
                  Save this hash — you will need it when creating a job on TiwalaChain.
                </p>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
