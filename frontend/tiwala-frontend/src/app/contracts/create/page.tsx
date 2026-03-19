"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
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
  if (typeof direct === "number") {
    const normalized = direct <= 1 ? direct * 100 : direct;
    return Math.max(0, Math.min(100, normalized));
  }
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

  const compiledContractText = useMemo(
    () => buildContractLines().join("\n"),
    [jobTitle, employerName, freelancerName, freelancerWallet, startDate, endDate, projectDescription, totalAmountUsdt, revisionRounds, deliverables, allClausesForContract]
  );

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
      const { jsPDF } = await import("jspdf");
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
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } =
        await import("docx");
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

  const { theme } = useAppTheme();
  const isDarkTheme = theme === "dark";

  const panelClass = isDarkTheme
    ? "border border-white/12 bg-black/32"
    : "border border-[#e6e8f1] bg-white";
  const subtlePanelClass = isDarkTheme
    ? "border border-white/12 bg-white/[0.03]"
    : "border border-[#eaecf4] bg-[#fafbff]";
  const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
  const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
  const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
  const chipClass = isDarkTheme
    ? "border border-white/14 bg-white/[0.04] text-white/82"
    : "border border-[#e1e4f0] bg-white text-[#2a3040]";
  const actionChipClass = isDarkTheme
    ? "border border-violet-300/30 bg-violet-500/14 text-violet-100"
    : "border border-violet-200 bg-violet-50 text-violet-700";

  const inputClass = isDarkTheme
    ? "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50"
    : "h-11 w-full rounded-xl border border-[#dce0ec] bg-[#f8f9fc] px-4 text-sm text-[#1a1f30] outline-none transition placeholder:text-[#a0a6b8] focus:border-violet-400 focus:bg-white";
  const textareaClass = isDarkTheme
    ? "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50 focus:bg-black/50"
    : "w-full rounded-xl border border-[#dce0ec] bg-[#f8f9fc] px-4 py-3 text-sm text-[#1a1f30] outline-none transition placeholder:text-[#a0a6b8] focus:border-violet-400 focus:bg-white";
  const labelClass = isDarkTheme
    ? "mb-2 block text-xs font-medium text-white/70"
    : "mb-2 block text-xs font-medium text-[#4a506a]";

  if (!canUseContractBuilder) {
    return (
      <div className={isDarkTheme ? "text-white" : "text-[#141621]"}>
        <section className={`mx-auto w-full max-w-[1580px] space-y-5`}>
          <section className={`${panelClass} px-6 py-6 lg:px-8 lg:py-7`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
              Contract Builder
            </p>
            <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
              Employer Access Required
            </h1>
            <p className={`mt-2 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
              The Contract Builder is only available for users with an Employer or Both role.
            </p>
            <Link
              href="/settings/profile"
              className={`${actionChipClass} mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/20`}
            >
              Update Profile Settings
            </Link>
          </section>
        </section>
      </div>
    );
  }

  return (
    <div className={isDarkTheme ? "text-white" : "text-[#141621]"}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <section className={`${panelClass} px-6 py-6 lg:px-8 lg:py-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
                Contract Builder
              </p>
              <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
                Draft your agreement
              </h1>
              <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                Compose terms, run AI fairness checks, then export a professional contract file for your escrow job.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {stepRail.map((item) => (
              <div className={`${subtlePanelClass} rounded-xl px-4 py-3`} key={item.step}>
                <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Step {item.step}</p>
                <p className={`mt-2 text-lg font-semibold ${titleClass}`}>{item.title}</p>
                <p className={`mt-1 text-xs ${mutedTextClass}`}>{item.subtitle}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} p-6 lg:p-7`}>
          <div>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Contract Details</p>
            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
              Parties, dates, and scope
            </h2>
          </div>

          {formErrors.length > 0 ? (
            <div className={`mt-5 rounded-xl border p-4 ${isDarkTheme ? "border-red-300/25 bg-red-500/10" : "border-red-200 bg-red-50"}`}>
              <p className={`flex items-center gap-2 text-sm font-semibold ${isDarkTheme ? "text-red-200" : "text-red-700"}`}>
                <AlertTriangle size={15} />
                Please fix the following
              </p>
              <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${isDarkTheme ? "text-red-100/80" : "text-red-600"}`}>
                {formErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

        <div className="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Job Title</label>
            <input className={inputClass} onChange={(e) => setJobTitle(e.target.value)} value={jobTitle} />
          </div>
          <div>
            <label className={labelClass}>Employer Name / Company</label>
            <input className={inputClass} onChange={(e) => setEmployerName(e.target.value)} value={employerName} />
          </div>
          <div>
            <label className={labelClass}>Freelancer Name</label>
            <input className={inputClass} onChange={(e) => setFreelancerName(e.target.value)} value={freelancerName} />
          </div>
          <div>
            <label className={labelClass}>Freelancer Wallet</label>
            <input className={`${inputClass} font-mono`} onChange={(e) => setFreelancerWallet(e.target.value)} placeholder="0x..." value={freelancerWallet} />
          </div>
          <div>
            <label className={labelClass}>Start Date</label>
            <input className={inputClass} onChange={(e) => setStartDate(e.target.value)} type="date" value={startDate} />
          </div>
          <div>
            <label className={labelClass}>End Date</label>
            <input className={inputClass} onChange={(e) => setEndDate(e.target.value)} type="date" value={endDate} />
          </div>
        </div>

        <div className="mt-5">
          <label className={labelClass}>Project Description</label>
          <textarea className={`${textareaClass} min-h-28`} onChange={(e) => setProjectDescription(e.target.value)} value={projectDescription} />
        </div>

        <div className={`mt-5 ${subtlePanelClass} rounded-xl p-4`}>
          <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Confidentiality Clause</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                confidentialityEnabled
                  ? isDarkTheme ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" : "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : isDarkTheme ? "border-white/10 text-white/40" : "border-[#dce0ec] text-[#8b90a6]"
              }`}
              onClick={() => setConfidentialityEnabled(true)}
              type="button"
            >
              Included
            </button>
            <button
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                !confidentialityEnabled
                  ? isDarkTheme ? "border-white/15 bg-white/[0.06] text-white/70" : "border-[#c8ccdb] bg-white text-[#3d4460]"
                  : isDarkTheme ? "border-white/10 text-white/40" : "border-[#dce0ec] text-[#8b90a6]"
              }`}
              onClick={() => setConfidentialityEnabled(false)}
              type="button"
            >
              Excluded
            </button>
          </div>
          {confidentialityEnabled ? (
            <p className={`mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-relaxed ${mutedTextClass}`}>
              {STANDARD_CONFIDENTIALITY}
            </p>
          ) : null}
        </div>
        </section>

        <section className={`${panelClass} p-6 lg:p-7`}>
          <div>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Compensation & Deliverables</p>
            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
              Payment, milestones, and outputs
            </h2>
          </div>

        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Total Amount (USDT)</label>
            <input className={inputClass} min="0" onChange={(e) => setTotalAmountUsdt(e.target.value)} step="0.01" type="number" value={totalAmountUsdt} />
          </div>
          <div>
            <label className={labelClass}>Revision Rounds</label>
            <input className={inputClass} min="0" onChange={(e) => setRevisionRounds(e.target.value)} type="number" value={revisionRounds} />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Payment Terms</label>
          <p className={`${actionChipClass} inline-block rounded-xl px-4 py-2.5 text-sm`}>
            100% on completion
          </p>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <label className={labelClass + " mb-0"}>Deliverables</label>
            <button
              className={`${chipClass} inline-flex items-center gap-2 px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
              onClick={() => setDeliverables((prev) => [...prev, ""])}
              type="button"
            >
              <Plus size={14} />
              Add Deliverable
            </button>
          </div>
          <div className="space-y-2">
            {deliverables.map((item, index) => (
              <div className="flex items-start gap-2" key={`deliverable-${index}`}>
                <span className={`mt-3 min-w-8 text-sm ${tinyLabelClass}`}>{index + 1}.</span>
                <textarea className={`${textareaClass} min-h-[72px] flex-1`} onChange={(e) => updateArrayValue(setDeliverables, index, e.target.value)} value={item} />
                <button
                  className={`mt-2 inline-flex size-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-red-500/10 hover:text-red-300 ${!isDarkTheme ? "text-[#b0b4c4] hover:bg-red-50 hover:text-red-600" : ""}`}
                  onClick={() => removeArrayValue(setDeliverables, index)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        </section>

        <section className={`${panelClass} p-6 lg:p-7`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Custom Clauses</p>
              <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                Additional terms
              </h2>
            </div>
            <button
              className={`${chipClass} inline-flex items-center gap-2 px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
              onClick={() => setCustomClauses((prev) => [...prev, ""])}
              type="button"
            >
              <Plus size={14} />
              Add Clause
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {customClauses.map((clause, index) => (
              <div className="flex items-start gap-2" key={`custom-clause-${index}`}>
                <span className={`mt-3 min-w-8 text-sm ${tinyLabelClass}`}>{index + 1}.</span>
                <textarea className={`${textareaClass} min-h-[80px] flex-1`} onChange={(e) => updateArrayValue(setCustomClauses, index, e.target.value)} value={clause} />
                <button
                  className={`mt-2 inline-flex size-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-red-500/10 hover:text-red-300 ${!isDarkTheme ? "text-[#b0b4c4] hover:bg-red-50 hover:text-red-600" : ""}`}
                  onClick={() => removeArrayValue(setCustomClauses, index)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} p-6 lg:p-7`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>AI Fairness Review</p>
              <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                Evaluate clauses for fairness
              </h2>
            </div>
            <span className={`${actionChipClass} inline-flex size-10 shrink-0 items-center justify-center`}>
              <Search size={17} />
            </span>
          </div>

          <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
            Run an AI check on your contract to flag potentially unfair clauses and get suggested improvements.
          </p>

          <button
            className={`mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${actionChipClass} hover:border-violet-300/50 hover:bg-violet-500/20`}
            disabled={isEvaluating}
            onClick={evaluateFairness}
            type="button"
          >
            {isEvaluating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Search size={15} />
                Evaluate Contract Fairness
              </>
            )}
          </button>

          {evaluationError ? (
            <div className={`mt-4 flex items-start gap-2.5 rounded-xl border p-4 ${isDarkTheme ? "border-red-300/25 bg-red-500/10" : "border-red-200 bg-red-50"}`}>
              <X size={15} className={`mt-0.5 shrink-0 ${isDarkTheme ? "text-red-400" : "text-red-500"}`} />
              <p className={`text-sm ${isDarkTheme ? "text-red-200/80" : "text-red-600"}`}>{evaluationError}</p>
            </div>
          ) : null}

          {fairnessScore !== null ? (
            <div className={`${subtlePanelClass} mt-5 rounded-xl p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Overall Fairness Score</p>
                <span className={`text-2xl font-semibold tabular-nums ${
                  fairnessScore > 70
                    ? isDarkTheme ? "text-emerald-400" : "text-emerald-600"
                    : fairnessScore >= 50
                      ? isDarkTheme ? "text-amber-400" : "text-amber-600"
                      : isDarkTheme ? "text-red-400" : "text-red-600"
                }`}>
                  {fairnessScore.toFixed(1)}%
                </span>
              </div>
              <div className={`mt-2 h-2 overflow-hidden rounded-full ${isDarkTheme ? "bg-white/10" : "bg-[#e4e7f1]"}`}>
                <div className={`h-full rounded-full transition-all duration-500 ${renderProgressColor()}`} style={{ width: `${Math.max(0, Math.min(100, fairnessScore))}%` }} />
              </div>
            </div>
          ) : null}

          {hasUnfairClause ? (
            <div className={`mt-4 rounded-xl border px-4 py-3 ${isDarkTheme ? "border-amber-300/25 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              One or more clauses were flagged as potentially unfair. Review the suggestions below.
            </div>
          ) : null}

          {evaluatedClauses.length > 0 ? (
            <div className={`${subtlePanelClass} mt-5 divide-y rounded-xl ${isDarkTheme ? "divide-white/10" : "divide-[#eceef5]"}`}>
              {evaluatedClauses.map((item) => (
                <div className="px-4 py-4 first:pt-4 last:pb-4" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Clause {item.clauseNumber}</p>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        item.isFair
                          ? isDarkTheme ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : isDarkTheme ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700"
                      }`}>
                        {item.isFair ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        {item.isFair ? "Fair" : "Unfair"}
                      </span>
                      {item.confidence !== null ? (
                        <span className={`text-[11px] ${mutedTextClass}`}>{item.confidence.toFixed(0)}% confidence</span>
                      ) : null}
                    </div>
                  </div>
                  <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed ${mutedTextClass}`}>{item.text}</p>

                  {!item.isFair && item.suggestion && !item.dismissed ? (
                    <div className={`mt-3 rounded-lg border p-3 ${isDarkTheme ? "border-violet-400/20 bg-violet-500/8" : "border-violet-200 bg-violet-50"}`}>
                      <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Suggested safer wording</p>
                      <p className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed ${isDarkTheme ? "text-violet-100/80" : "text-violet-800"}`}>{item.suggestion}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            item.applied ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-violet-400/25 bg-violet-500/10 text-violet-200"
                          }`}
                          onClick={() => applySuggestion(item)}
                          type="button"
                        >
                          {item.applied ? <><CheckCircle2 size={12} /> Applied</> : "Apply Suggestion"}
                        </button>
                        <button
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isDarkTheme ? "border-white/10 text-white/40 hover:text-white/60" : "border-[#dce0ec] text-[#8b90a6] hover:text-[#4a506a]"}`}
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
          ) : null}
        </section>

        <section className={`${panelClass} p-6 lg:p-7`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Export Contract</p>
              <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${titleClass}`}>
                Download signature-ready file
              </h2>
            </div>
            <span className={`${chipClass} inline-flex size-10 shrink-0 items-center justify-center`}>
              <Download size={16} />
            </span>
          </div>

          <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
            Generate a PDF or DOCX with your contract terms. Save the SHA-256 hash for job creation.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className={`${actionChipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={isExportingPdf}
              onClick={exportPdf}
              type="button"
            >
              {isExportingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {isExportingPdf ? "Generating..." : "Download PDF"}
            </button>
            <button
              className={`${chipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={isExportingDocx}
              onClick={exportDocx}
              type="button"
            >
              {isExportingDocx ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {isExportingDocx ? "Generating..." : "Download DOCX"}
            </button>
          </div>

          {lastFileHash ? (
            <div className={`${subtlePanelClass} mt-5 rounded-xl p-5`}>
              <div className="flex items-center gap-2">
                <span className={`${chipClass} inline-flex size-9 items-center justify-center`}>
                  <ShieldCheck size={15} />
                </span>
                <p className={`text-sm font-semibold ${titleClass}`}>SHA-256 File Hash</p>
              </div>
              <p className={`mt-3 break-all rounded-lg border p-3 font-mono text-xs leading-relaxed ${isDarkTheme ? "border-white/10 bg-black/40 text-white/70" : "border-[#e4e7f1] bg-[#f3f5fa] text-[#3d4460]"}`}>
                {lastFileHash}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  className={`${chipClass} inline-flex items-center gap-2 px-3 py-2 text-sm transition hover:border-violet-300/50 hover:bg-violet-500/10`}
                  onClick={copyHash}
                  type="button"
                >
                  <ClipboardCopy size={14} />
                  {copiedHash ? "Copied" : "Copy Hash"}
                </button>
                <p className={`text-xs ${isDarkTheme ? "text-amber-200/80" : "text-amber-700"}`}>
                  Save this hash — you will need it when creating a job on TiwalaChain.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
