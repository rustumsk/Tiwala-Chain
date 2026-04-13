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
  FileCheck,
  Sparkles,
  FileSignature,
  ArrowRight,
  Eye,
  ChevronRight,
} from "lucide-react";
import { useAppTheme } from "@/components/layout/theme-context";
import { API_BASE_URL } from "@/lib/auth";
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

type LegalBlock =
  | { kind: "title"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "labeled"; label: string; body: string }
  | { kind: "signatures"; clientName: string; freelancerName: string };

function buildLegalContractBlocks(params: {
  jobTitle: string;
  employerName: string;
  freelancerName: string;
  freelancerWallet: string;
  projectDescription: string;
  startDate: string;
  endDate: string;
  totalAmountUsdt: string;
  revisionRounds: string;
  deliverables: string[];
  additionalClauses: string[];
}): LegalBlock[] {
  const {
    jobTitle,
    employerName,
    freelancerName,
    freelancerWallet,
    projectDescription,
    startDate,
    endDate,
    totalAmountUsdt,
    revisionRounds,
    deliverables,
    additionalClauses,
  } = params;

  const deliv = deliverables.map((d) => d.trim()).filter(Boolean);
  const exhibitA = [
    `Project title: ${jobTitle}`,
    "",
    "Description of services:",
    projectDescription,
    "",
    "Deliverables:",
    ...deliv.map((d, i) => `${i + 1}. ${d}`),
    "",
    `Freelancer wallet (for records / escrow): ${freelancerWallet}`,
  ].join("\n");

  const extraClauses =
    additionalClauses.length === 0
      ? ""
      : `\n\nAdditional terms:\n${additionalClauses
          .map((c, i) => `${i + 1}. ${c}`)
          .join("\n\n")}`;

  return [
    { kind: "title", text: "FREELANCE CONTRACT" },
    {
      kind: "paragraph",
      text: `This Freelancer Contract ("Contract") dated as of ${formatDate(startDate)} (the "Effective Date") is made between ${employerName} (the "Client") and ${freelancerName} (the "Freelancer").`,
    },
    {
      kind: "paragraph",
      text: "In consideration of the mutual obligations specified in this Contract, the parties agree as follows:",
    },
    {
      kind: "labeled",
      label: "Freelancer Services.",
      body: `The Freelancer shall perform services for the Client substantially as described in Exhibit A attached hereto and incorporated by reference. Work outside Exhibit A requires a written change order or a new agreement.\n\nEXHIBIT A — SCOPE OF SERVICES\n\n${exhibitA}${extraClauses}`,
    },
    {
      kind: "labeled",
      label: "Consideration and Compensation.",
      body: `The Client shall pay the Freelancer a total of ${totalAmountUsdt} USDT for the services described in Exhibit A, payable as follows: ${PAYMENT_TERMS_LABEL}. Up to ${revisionRounds} revision round(s) are included unless otherwise stated in Exhibit A. The performance period runs from ${formatDate(startDate)} through ${formatDate(endDate)}.`,
    },
    {
      kind: "labeled",
      label: "Invoicing and Payment.",
      body: "Unless otherwise agreed in writing, the Freelancer may invoice the Client upon completion of milestones as set forth in Exhibit A. Payment is due within fourteen (14) days of receipt of a proper invoice unless the parties agree otherwise in writing. Payment may be made by bank transfer, stablecoin (USDT), or other method the parties agree in writing.",
    },
    {
      kind: "labeled",
      label: "Expenses.",
      body: "The Freelancer shall obtain prior written approval from the Client for any expenses expected to exceed fifty ($50) USD (or equivalent). Unless approved in advance in writing, expenses are the responsibility of the Freelancer.",
    },
    {
      kind: "labeled",
      label: "Invoice Disputes.",
      body: "The Client shall notify the Freelancer in writing of any good-faith dispute regarding an invoice within ten (10) Business Days of receipt. The parties shall cooperate in good faith to resolve any such dispute.",
    },
    {
      kind: "paragraph",
      text: "IN WITNESS WHEREOF, the parties have executed this Contract as of the Effective Date.",
    },
    { kind: "signatures", clientName: employerName, freelancerName },
  ];
}

function legalBlocksToPlainText(blocks: LegalBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "title") return b.text;
      if (b.kind === "paragraph") return b.text;
      if (b.kind === "labeled") return `${b.label} ${b.body}`;
      if (b.kind === "signatures") {
        return [
          `CLIENT: ${b.clientName}`,
          "",
          "Signature: _______________________________________________    Date: _______________",
          "",
          `FREELANCER: ${b.freelancerName}`,
          "",
          "Signature: _______________________________________________    Date: _______________",
        ].join("\n");
      }
      return "";
    })
    .join("\n\n");
}

function parseScore(payload: Record<string, unknown>): number | null {
  const direct = payload.fairness_score?? payload.overall_score?? payload.score;
  if (typeof direct === "number") {
    const normalized = direct <= 1? direct * 100 : direct;
    return Math.max(0, Math.min(100, normalized));
  }
  return null;
}

function parseClauseResults(payload: Record<string, unknown>) {
  const raw = payload.clauses?? payload.analysis?? payload.results;
  if (!Array.isArray(raw)) return [] as Array<Record<string, unknown>>;
  return raw.filter((item): item is Record<string, unknown> =>!!item && typeof item === "object");
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
  const [showPreview, setShowPreview] = useState(false);

  const allClausesForContract = useMemo(() => {
    const clauses: string[] = [];
    if (confidentialityEnabled) clauses.push(STANDARD_CONFIDENTIALITY);
    customClauses
     .map((clause) => clause.trim())
     .filter(Boolean)
     .forEach((clause) => clauses.push(clause));
    return clauses;
  }, [confidentialityEnabled, customClauses]);

  const hasUnfairClause = evaluatedClauses.some((clause) =>!clause.isFair);
  const profile = useMemo(() => {
    if (!isConnected ||!address || typeof window === "undefined") return null;
    const stored = getStoredProfile();
    if (!stored) return null;
    return stored.wallet.toLowerCase() === address.toLowerCase()? stored : null;
  }, [address, isConnected]);
  const canUseContractBuilder =
    profile?.role === "employer";

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
    if (deliverables.every((item) =>!item.trim())) {
      errors.push("At least one deliverable is required.");
    }
    if (!(Number(revisionRounds) >= 0)) {
      errors.push("Number of revision rounds must be 0 or greater.");
    }

    setFormErrors(errors);
    return errors.length === 0;
  };

  const compiledContractText = useMemo(
    () =>
      legalBlocksToPlainText(
        buildLegalContractBlocks({
          jobTitle,
          employerName,
          freelancerName,
          freelancerWallet,
          projectDescription,
          startDate,
          endDate,
          totalAmountUsdt,
          revisionRounds,
          deliverables,
          additionalClauses: allClausesForContract,
        })
      ),
    [
      jobTitle,
      employerName,
      freelancerName,
      freelancerWallet,
      projectDescription,
      startDate,
      endDate,
      totalAmountUsdt,
      revisionRounds,
      deliverables,
      allClausesForContract,
    ]
  );

  const updateArrayValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, idx) => (idx === index? value : item)));
  };

  const removeArrayValue = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => {
      if (prev.length === 1) return [""];
      return prev.filter((_, idx) => idx!== index);
    });
  };

  const evaluateFairness = async () => {
    if (!validateForm()) return;

    setEvaluationError("");
    setIsEvaluating(true);
    setCopiedHash(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/contracts/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: compiledContractText }),
      });

      if (!response.ok) {
        const details = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(details?.error?? `AI evaluation failed (${response.status}).`);
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
                 ? Math.max(0, Math.min(100, confidenceRaw <= 1? confidenceRaw * 100 : confidenceRaw))
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
      const message = error instanceof Error? error.message : "Unknown evaluation error.";
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
      const offset = confidentialityEnabled? 1 : 0;
      const customIndex = item.clauseNumber - 1 - offset;
      if (customIndex < 0 || customIndex >= prev.length) return prev;
      return prev.map((clause, idx) => (idx === customIndex? item.suggestion : clause));
    });

    setEvaluatedClauses((prev) =>
      prev.map((clause) =>
        clause.id === item.id
         ? {...clause, text: item.suggestion, dismissed: false, applied: true }
          : clause
      )
    );
  };

  const keepOriginal = (itemId: string) => {
    setEvaluatedClauses((prev) =>
      prev.map((clause) =>
        clause.id === itemId? {...clause, dismissed: true, applied: false } : clause
      )
    );
  };

  const exportPdf = async () => {
    if (!validateForm()) return;

    setIsExportingPdf(true);
    setCopiedHash(false);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const marginX = 72;
      const topMargin = 72;
      const bottomMargin = 72;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - marginX * 2;
      let y = topMargin;

      const blocks = buildLegalContractBlocks({
        jobTitle,
        employerName,
        freelancerName,
        freelancerWallet,
        projectDescription,
        startDate,
        endDate,
        totalAmountUsdt,
        revisionRounds,
        deliverables,
        additionalClauses: allClausesForContract,
      });

      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - bottomMargin) {
          pdf.addPage();
          y = topMargin;
        }
      };

      const writeWrappedTimes = (
        text: string,
        opts: {
          fontSize?: number;
          lineHeight?: number;
          fontStyle?: "normal" | "bold" | "italic";
          indent?: number;
        } = {}
      ) => {
        const fontSize = opts.fontSize ?? 11;
        const lineHeight = opts.lineHeight ?? 15;
        const fontStyle = opts.fontStyle ?? "normal";
        const indent = opts.indent ?? 0;
        const paragraphs = text
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        const toFlow =
          paragraphs.length > 0 ? paragraphs : [text.trim() || " "];
        for (const raw of toFlow) {
          const para = raw.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
          pdf.setFont("times", fontStyle);
          pdf.setFontSize(fontSize);
          pdf.setTextColor(0, 0, 0);
          const wrapped = pdf.splitTextToSize(para, contentWidth - indent) as string[];
          ensureSpace(wrapped.length * lineHeight + 6);
          wrapped.forEach((line) => {
            pdf.text(line, marginX + indent, y);
            y += lineHeight;
          });
          y += 4;
        }
      };

      for (const block of blocks) {
        if (block.kind === "title") {
          ensureSpace(40);
          pdf.setFont("times", "bold");
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          const title = block.text;
          const tw = pdf.getTextWidth(title);
          const tx = (pageWidth - tw) / 2;
          pdf.text(title, tx, y);
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.75);
          pdf.line(tx, y + 4, tx + tw, y + 4);
          y += 36;
        } else if (block.kind === "paragraph") {
          y += 4;
          writeWrappedTimes(block.text, { fontSize: 11, lineHeight: 15, fontStyle: "normal" });
          y += 6;
        } else if (block.kind === "labeled") {
          y += 8;
          pdf.setFont("times", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(0, 0, 0);
          pdf.text(block.label, marginX, y);
          y += 16;
          writeWrappedTimes(block.body, { fontSize: 11, lineHeight: 15, fontStyle: "normal" });
          y += 6;
        } else if (block.kind === "signatures") {
          y += 14;
          writeWrappedTimes(`CLIENT: ${block.clientName}`, { fontStyle: "bold" });
          y += 2;
          writeWrappedTimes(
            "Signature: _______________________________________________    Date: _______________",
            { fontSize: 11, lineHeight: 14 }
          );
          y += 8;
          writeWrappedTimes(`FREELANCER: ${block.freelancerName}`, { fontStyle: "bold" });
          y += 2;
          writeWrappedTimes(
            "Signature: _______________________________________________    Date: _______________",
            { fontSize: 11, lineHeight: 14 }
          );
        }
      }

      if (fairnessScore !== null) {
        y += 12;
        pdf.setFont("times", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        pdf.text("Schedule B — AI fairness summary (informational only)", marginX, y);
        y += 18;
        const summary = `Fairness score: ${fairnessScore.toFixed(1)} / 100. ${
          hasUnfairClause
            ? "One or more clauses were flagged during automated review; review suggestions before signing."
            : "No high-risk clauses were flagged during automated review."
        }`;
        writeWrappedTimes(summary, { fontSize: 10, lineHeight: 14 });
      }

      y += 8;
      writeWrappedTimes(
        `Document generated ${new Date().toLocaleString()} · TiwalaChain`,
        { fontSize: 9, lineHeight: 12, fontStyle: "italic" }
      );

      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setFont("times", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(90, 90, 90);
        pdf.text(`Page ${page} of ${totalPages}`, pageWidth - marginX, pageHeight - 28, {
          align: "right",
        });
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
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        AlignmentType,
        UnderlineType,
      } = await import("docx");

      const blocks = buildLegalContractBlocks({
        jobTitle,
        employerName,
        freelancerName,
        freelancerWallet,
        projectDescription,
        startDate,
        endDate,
        totalAmountUsdt,
        revisionRounds,
        deliverables,
        additionalClauses: allClausesForContract,
      });

      const PT_11 = 22;
      const children: InstanceType<typeof Paragraph>[] = [];

      for (const block of blocks) {
        if (block.kind === "title") {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: block.text,
                  bold: true,
                  size: 32,
                  font: "Times New Roman",
                  underline: { type: UnderlineType.SINGLE },
                }),
              ],
            })
          );
        } else if (block.kind === "paragraph") {
          children.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 240 },
              children: [
                new TextRun({
                  text: block.text,
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
        } else if (block.kind === "labeled") {
          const bodyParts = block.body
            .split(/\n\s*\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const first = bodyParts[0] ?? "";
          const rest = bodyParts.slice(1);
          children.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: rest.length ? 160 : 220 },
              children: [
                new TextRun({
                  text: `${block.label} `,
                  bold: true,
                  font: "Times New Roman",
                  size: PT_11,
                }),
                new TextRun({
                  text: first,
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
          for (const part of rest) {
            children.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text: part,
                    font: "Times New Roman",
                    size: PT_11,
                  }),
                ],
              })
            );
          }
        } else if (block.kind === "signatures") {
          children.push(
            new Paragraph({
              spacing: { before: 360, after: 160 },
              children: [
                new TextRun({
                  text: `CLIENT: ${block.clientName}`,
                  bold: true,
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
          children.push(
            new Paragraph({
              spacing: { after: 280 },
              children: [
                new TextRun({
                  text: "Signature: _______________________________________________    Date: _______________",
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [
                new TextRun({
                  text: `FREELANCER: ${block.freelancerName}`,
                  bold: true,
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
          children.push(
            new Paragraph({
              spacing: { after: 240 },
              children: [
                new TextRun({
                  text: "Signature: _______________________________________________    Date: _______________",
                  font: "Times New Roman",
                  size: PT_11,
                }),
              ],
            })
          );
        }
      }

      if (fairnessScore !== null) {
        children.push(
          new Paragraph({
            spacing: { before: 360, after: 160 },
            children: [
              new TextRun({
                text: "Schedule B — AI fairness summary (informational only)",
                bold: true,
                font: "Times New Roman",
                size: PT_11,
              }),
            ],
          })
        );
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Fairness score: ${fairnessScore.toFixed(1)} / 100. ${
                  hasUnfairClause
                    ? "One or more clauses were flagged during automated review; review suggestions before signing."
                    : "No high-risk clauses were flagged during automated review."
                }`,
                font: "Times New Roman",
                size: PT_11,
              }),
            ],
          })
        );
      }

      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 280 },
          children: [
            new TextRun({
              text: `Generated ${new Date().toLocaleString()} · TiwalaChain`,
              italics: true,
              size: 18,
              font: "Times New Roman",
            }),
          ],
        })
      );

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "Times New Roman",
                size: PT_11,
              },
            },
          },
        },
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

  const cardClass = isDarkTheme
   ? "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
    : "rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(15,23,42,0.12)]";

  const subtleCardClass = isDarkTheme
   ? "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-lg"
    : "rounded-xl border border-slate-200 bg-slate-50/60";

  const inputClass = isDarkTheme
   ? "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-violet-400/60 focus:bg-black/40 focus:ring-4 focus:ring-violet-500/10"
    : "h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";

  const textareaClass = isDarkTheme
   ? "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-violet-400/60 focus:bg-black/40 focus:ring-4 focus:ring-violet-500/10"
    : "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";

  const labelClass = isDarkTheme
   ? "mb-2 block text-xs font-semibold uppercase tracking-wider text-white/70"
    : "mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600";

  const primaryBtnClass = isDarkTheme
   ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-violet-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-violet-600"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-violet-500/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

  const secondaryBtnClass = isDarkTheme
   ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-50"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-400 active:scale-95 disabled:opacity-50";

  const ghostBtnClass = isDarkTheme
   ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white/70 transition-all hover:bg-white/5 hover:text-white"
    : "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900";

  const titleClass = isDarkTheme? "text-white" : "text-slate-900";
  const mutedTextClass = isDarkTheme? "text-white/65" : "text-slate-600";
  const tinyLabelClass = isDarkTheme? "text-white/50" : "text-slate-500";

  const getScoreColor = () => {
    if (fairnessScore === null) return isDarkTheme? "text-white/40" : "text-slate-400";
    if (fairnessScore > 70) return isDarkTheme? "text-emerald-400" : "text-emerald-600";
    if (fairnessScore >= 50) return isDarkTheme? "text-amber-400" : "text-amber-600";
    return isDarkTheme? "text-red-400" : "text-red-600";
  };

  const getScoreGradient = () => {
    if (fairnessScore === null) return "from-slate-500 to-slate-400";
    if (fairnessScore > 70) return "from-emerald-500 to-emerald-400";
    if (fairnessScore >= 50) return "from-amber-500 to-amber-400";
    return "from-red-500 to-red-400";
  };

  const stepProgress = useMemo(() => {
    if (lastFileHash) return 3;
    if (evaluatedClauses.length > 0) return 2;
    return 1;
  }, [lastFileHash, evaluatedClauses.length]);

  const steps = [
    { num: 1, title: "Compose", icon: FileSignature, desc: "Fill contract details" },
    { num: 2, title: "Review", icon: Sparkles, desc: "AI fairness check" },
    { num: 3, title: "Export", icon: FileCheck, desc: "Download & hash" },
  ];

  if (!canUseContractBuilder) {
    return (
      <div className={isDarkTheme? "min-h-screen bg-[#0a0b0f] text-white" : "min-h-screen bg-slate-50 text-slate-900"}>
        <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className={`${cardClass} p-8 text-center`}>
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-violet-500/10">
              <ShieldCheck className="size-8 text-violet-500" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">
              Contract Builder
            </p>
            <h1 className={`mt-3 text-3xl font-bold tracking-tight ${titleClass}`}>
              Employer Access Required
            </h1>
            <p className={`mx-auto mt-3 max-w-md text-sm leading-relaxed ${mutedTextClass}`}>
              The Contract Builder is only available for users with an Employer role. Update your profile to get started.
            </p>
            <Link
              href="/settings/profile"
              className={`${primaryBtnClass} mt-6`}
            >
              Update Profile Settings
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isDarkTheme? "min-h-screen bg-[#0a0b0f] text-white" : "min-h-screen bg-slate-50 text-slate-900"}>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header + Progress */}
        <div className={`${cardClass} p-6 sm:p-8`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-500/30">
                  <FileSignature size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">
                    TiwalaChain
                  </p>
                  <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${titleClass}`}>
                    Contract Builder
                  </h1>
                </div>
              </div>
              <p className={`mt-3 max-w-2xl text-sm leading-relaxed ${mutedTextClass}`}>
                Draft professional freelancing agreements with AI-powered fairness checks and blockchain-ready exports.
              </p>
            </div>
          </div>

          {/* Animated Step Progress */}
          <div className="mt-8">
            <div className="flex items-center justify-between gap-2">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isActive = stepProgress >= step.num;
                const isCurrent = stepProgress === step.num;
                return (
                  <div key={step.num} className="flex flex-1 items-center gap-2">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
                      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-500 ${
                        isActive
                         ? "bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-500/30 scale-100"
                          : isDarkTheme? "bg-white/5 border border-white/10 scale-95" : "bg-slate-100 border border-slate-200 scale-95"
                      } ${isCurrent? "animate-pulse" : ""}`}>
                        <Icon size={20} className={isActive? "text-white" : isDarkTheme? "text-white/40" : "text-slate-400"} />
                      </div>
                      <div className="hidden sm:block">
                        <p className={`text-xs font-semibold transition-colors duration-300 ${isActive? titleClass : mutedTextClass}`}>
                          {step.title}
                        </p>
                        <p className={`text-xs ${tinyLabelClass}`}>{step.desc}</p>
                      </div>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`h-0.5 flex-1 rounded-full transition-all duration-700 ${
                        stepProgress > step.num
                         ? "bg-gradient-to-r from-violet-500 to-violet-400"
                          : isDarkTheme? "bg-white/10" : "bg-slate-200"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {formErrors.length > 0 && (
          <div className={`${cardClass} mt-5 border-l-4 ${isDarkTheme? "border-l-red-500" : "border-l-red-500"} p-5 animate-in slide-in-from-top duration-300`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="font-semibold text-red-500">Please fix the following errors</p>
                <ul className={`mt-2 space-y-1 text-sm ${isDarkTheme? "text-red-300/90" : "text-red-700"}`}>
                  {formErrors.map((error) => (
                    <li key={error} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Contract Details */}
        <div className={`${cardClass} mt-5 p-6 sm:p-8`}>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10">
              <span className="text-sm font-bold text-violet-500">01</span>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Step 1</p>
              <h2 className={`text-xl font-bold tracking-tight ${titleClass}`}>
                Contract Details
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Job Title</label>
              <input className={inputClass} onChange={(e) => setJobTitle(e.target.value)} value={jobTitle} placeholder="e.g. Brand Website Redesign" />
            </div>
            <div>
              <label className={labelClass}>Employer Name / Company</label>
              <input className={inputClass} onChange={(e) => setEmployerName(e.target.value)} value={employerName} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label className={labelClass}>Freelancer Name</label>
              <input className={inputClass} onChange={(e) => setFreelancerName(e.target.value)} value={freelancerName} placeholder="e.g. Jane Doe" />
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
        <textarea className={`${textareaClass} min-h-32`} onChange={(e) => setProjectDescription(e.target.value)} value={projectDescription} placeholder="Describe the scope, goals, and key deliverables..." />
      </div>

      <div className={`mt-6 ${subtleCardClass} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Confidentiality Clause</p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>
              Protect sensitive business information shared during the project.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                confidentialityEnabled
                  ? isDarkTheme 
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" 
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300"
                  : isDarkTheme 
                    ? "bg-white/5 text-white/50 hover:bg-white/10" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              onClick={() => setConfidentialityEnabled(true)}
              type="button"
            >
              <CheckCircle2 size={15} />
              Included
            </button>
            <button
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                !confidentialityEnabled
                  ? isDarkTheme 
                    ? "bg-white/10 text-white/90 ring-1 ring-white/20" 
                    : "bg-slate-200 text-slate-800 ring-1 ring-slate-300"
                  : isDarkTheme 
                    ? "bg-white/5 text-white/50 hover:bg-white/10" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              onClick={() => setConfidentialityEnabled(false)}
              type="button"
            >
              <X size={15} />
              Excluded
            </button>
          </div>
        </div>
        {confidentialityEnabled ? (
          <div className={`mt-4 rounded-xl border p-4 ${isDarkTheme ? "border-white/10 bg-black/20" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-sm leading-relaxed ${mutedTextClass}`}>
              {STANDARD_CONFIDENTIALITY}
            </p>
          </div>
        ) : null}
      </div>
    </div>

    {/* Section 2: Compensation & Deliverables */}
    <div className={`${cardClass} mt-5 p-6 sm:p-8`}>
      <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10">
          <span className="text-sm font-bold text-violet-500">02</span>
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Step 2</p>
          <h2 className={`text-xl font-bold tracking-tight ${titleClass}`}>
            Compensation & Deliverables
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Total Amount (USDT)</label>
          <input className={inputClass} min="0" onChange={(e) => setTotalAmountUsdt(e.target.value)} step="0.01" type="number" value={totalAmountUsdt} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass}>Revision Rounds</label>
          <input className={inputClass} min="0" onChange={(e) => setRevisionRounds(e.target.value)} type="number" value={revisionRounds} placeholder="e.g. 2" />
        </div>
      </div>

      <div className="mt-5">
        <label className={labelClass}>Payment Terms</label>
        <div className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
          isDarkTheme 
            ? "bg-violet-500/10 text-violet-300 ring-1 ring-violet-400/20" 
            : "bg-violet-50 text-violet-700 ring-1 ring-violet-200"
        }`}>
          <ShieldCheck size={16} />
          {PAYMENT_TERMS_LABEL}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <label className={labelClass + " mb-0"}>Deliverables</label>
          <button
            className={ghostBtnClass}
            onClick={() => setDeliverables((prev) => [...prev, ""])}
            type="button"
          >
            <Plus size={14} />
            Add Deliverable
          </button>
        </div>
        <div className="space-y-3">
          {deliverables.map((item, index) => (
            <div className="flex items-start gap-3" key={`deliverable-${index}`}>
              <span className={`mt-3 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                isDarkTheme ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-600"
              }`}>
                {index + 1}
              </span>
              <textarea 
                className={`${textareaClass} min-h-[80px] flex-1`} 
                onChange={(e) => updateArrayValue(setDeliverables, index, e.target.value)} 
                value={item}
                placeholder="Describe this deliverable..."
              />
              <button
                className={`mt-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                  isDarkTheme 
                    ? "text-white/30 hover:bg-red-500/10 hover:text-red-400" 
                    : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                }`}
                onClick={() => removeArrayValue(setDeliverables, index)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Section 3: Custom Clauses */}
    <div className={`${cardClass} mt-5 p-6 sm:p-8`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10">
            <span className="text-sm font-bold text-violet-500">03</span>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Step 3</p>
            <h2 className={`text-xl font-bold tracking-tight ${titleClass}`}>
              Custom Clauses
            </h2>
          </div>
        </div>
        <button
          className={ghostBtnClass}
          onClick={() => setCustomClauses((prev) => [...prev, ""])}
          type="button"
        >
          <Plus size={14} />
          Add Clause
        </button>
      </div>

      <p className={`mt-3 text-sm ${mutedTextClass}`}>
        Add any additional terms specific to this engagement.
      </p>

      <div className="mt-5 space-y-3">
        {customClauses.map((clause, index) => (
          <div className="flex items-start gap-3" key={`custom-clause-${index}`}>
            <span className={`mt-3 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
              isDarkTheme ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-600"
            }`}>
              {index + 1}
            </span>
            <textarea 
              className={`${textareaClass} min-h-[90px] flex-1`} 
              onChange={(e) => updateArrayValue(setCustomClauses, index, e.target.value)} 
              value={clause}
              placeholder="Enter custom clause text..."
            />
            <button
              className={`mt-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                isDarkTheme 
                  ? "text-white/30 hover:bg-red-500/10 hover:text-red-400" 
                  : "text-slate-400 hover:bg-red-50 hover:text-red-600"
              }`}
              onClick={() => removeArrayValue(setCustomClauses, index)}
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>

    {/* Section 4: AI Fairness Review */}
    <div className={`${cardClass} mt-5 p-6 sm:p-8`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-500/30">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Step 2</p>
            <h2 className={`text-xl font-bold tracking-tight ${titleClass}`}>
              AI Fairness Review
            </h2>
          </div>
        </div>
      </div>

      <p className={`mt-3 text-sm leading-relaxed ${mutedTextClass}`}>
        Our AI analyzes your contract clauses to flag potentially unfair terms and suggest safer alternatives before you finalize.
      </p>

      <button
        className={`${primaryBtnClass} mt-6`}
        disabled={isEvaluating}
        onClick={evaluateFairness}
        type="button"
      >
        {isEvaluating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing Contract...
          </>
        ) : (
          <>
            <Search size={16} />
            Evaluate Contract Fairness
          </>
        )}
      </button>

      {evaluationError ? (
        <div className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${
          isDarkTheme ? "border-red-400/20 bg-red-500/5" : "border-red-200 bg-red-50"
        }`}>
          <X size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-500">Evaluation Failed</p>
            <p className={`mt-1 text-sm ${isDarkTheme ? "text-red-300/80" : "text-red-700"}`}>{evaluationError}</p>
          </div>
        </div>
      ) : null}

      {fairnessScore !== null ? (
        <div className={`${subtleCardClass} mt-6 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Overall Fairness Score</p>
              <p className={`mt-2 text-4xl font-bold tabular-nums ${getScoreColor()}`}>
                {fairnessScore.toFixed(1)}<span className="text-2xl opacity-60">%</span>
              </p>
            </div>
            <div className={`flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${getScoreGradient()} shadow-lg`}>
              {fairnessScore > 70 ? <CheckCircle2 size={32} className="text-white" /> : <AlertTriangle size={32} className="text-white" />}
            </div>
          </div>
          <div className={`mt-4 h-2.5 overflow-hidden rounded-full ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`}>
            <div 
              className={`h-full rounded-full bg-gradient-to-r ${getScoreGradient()} transition-all duration-700 ease-out`} 
              style={{ width: `${Math.max(0, Math.min(100, fairnessScore))}%` }} 
            />
          </div>
          {hasUnfairClause && (
            <div className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 ${
              isDarkTheme ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800"
            }`}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs font-medium">
                One or more clauses were flagged as potentially unfair. Review the suggestions below.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {evaluatedClauses.length > 0 ? (
        <div className="mt-6 space-y-4">
          {evaluatedClauses.map((item, idx) => (
            <div 
              className={`rounded-xl border p-5 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                item.isFair
                  ? isDarkTheme 
                    ? "border-emerald-400/20 bg-emerald-500/5" 
                    : "border-emerald-200 bg-emerald-50/50"
                  : isDarkTheme 
                    ? "border-red-400/20 bg-red-500/5" 
                    : "border-red-200 bg-red-50/50"
              }`}
              style={{ animationDelay: `${idx * 50}ms` }}
              key={item.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${
                    isDarkTheme ? "bg-white/10" : "bg-slate-200"
                  }`}>
                    {item.clauseNumber}
                  </span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>
                    Clause {item.clauseNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    item.isFair
                      ? isDarkTheme 
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" 
                        : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                      : isDarkTheme 
                        ? "bg-red-500/15 text-red-300 ring-1 ring-red-400/30" 
                        : "bg-red-100 text-red-700 ring-1 ring-red-300"
                  }`}>
                    {item.isFair ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {item.isFair ? "Fair" : "Needs Review"}
                  </span>
                  {item.confidence !== null ? (
                    <span className={`text-xs font-medium tabular-nums ${mutedTextClass}`}>
                      {item.confidence.toFixed(0)}% confidence
                    </span>
                  ) : null}
                </div>
              </div>
              <p className={`mt-3 whitespace-pre-line text-sm leading-relaxed ${mutedTextClass}`}>{item.text}</p>

              {!item.isFair && item.suggestion && !item.dismissed ? (
                <div className={`mt-4 rounded-xl border p-4 ${
                  isDarkTheme 
                    ? "border-violet-400/20 bg-violet-500/8" 
                    : "border-violet-200 bg-violet-50"
                }`}>
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-violet-500" />
                    <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>
                      Suggested Safer Wording
                    </p>
                  </div>
                  <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed ${
                    isDarkTheme ? "text-violet-200/90" : "text-violet-900"
                  }`}>
                    {item.suggestion}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                        item.applied 
                          ? isDarkTheme 
                            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" 
                            : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                          : isDarkTheme
                            ? "bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30 hover:bg-violet-500/25"
                            : "bg-violet-100 text-violet-700 ring-1 ring-violet-300 hover:bg-violet-200"
                      }`}
                      onClick={() => applySuggestion(item)}
                      type="button"
                    >
                      {item.applied ? <><CheckCircle2 size={13} /> Applied</> : "Apply Suggestion"}
                    </button>
                    <button
                      className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                        isDarkTheme 
                          ? "text-white/50 hover:bg-white/5 hover:text-white/70" 
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      }`}
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
    </div>

    {/* Section 5: Export Contract */}
    <div className={`${cardClass} mt-5 p-6 sm:p-8`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-500/30">
            <FileCheck size={20} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${tinyLabelClass}`}>Step 3</p>
            <h2 className={`text-xl font-bold tracking-tight ${titleClass}`}>
              Export Contract
            </h2>
          </div>
        </div>
        <button
          className={`${ghostBtnClass} ${showPreview ? 'bg-violet-500/10' : ''}`}
          onClick={() => {
            if (validateForm()) setShowPreview(true);
          }}
          type="button"
        >
          <Eye size={14} />
          Preview
        </button>
      </div>

      <p className={`mt-3 text-sm leading-relaxed ${mutedTextClass}`}>
        Generate a PDF or DOCX file with your contract terms. The SHA-256 hash is required when creating a job on TiwalaChain.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className={primaryBtnClass}
          disabled={isExportingPdf}
          onClick={exportPdf}
          type="button"
        >
          {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {isExportingPdf ? "Generating PDF..." : "Download PDF"}
        </button>
        <button
          className={secondaryBtnClass}
          disabled={isExportingDocx}
          onClick={exportDocx}
          type="button"
        >
          {isExportingDocx ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {isExportingDocx ? "Generating DOCX..." : "Download DOCX"}
        </button>
      </div>

      {lastFileHash ? (
        <div className={`${subtleCardClass} mt-6 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500`}>
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl ${
              isDarkTheme ? "bg-violet-500/15" : "bg-violet-100"
            }`}>
              <ShieldCheck size={18} className="text-violet-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${titleClass}`}>SHA-256 File Hash</p>
              <p className={`text-xs ${mutedTextClass}`}>Save this for blockchain job creation</p>
            </div>
          </div>
          <div className={`mt-4 rounded-xl border p-4 font-mono text-xs leading-relaxed break-all ${
            isDarkTheme 
              ? "border-white/10 bg-black/30 text-white/80" 
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            {lastFileHash}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isDarkTheme 
                  ? "bg-white/5 text-white/90 hover:bg-white/10 ring-1 ring-white/10" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 ring-1 ring-slate-200"
              }`}
              onClick={copyHash}
              type="button"
            >
              {copiedHash ? <CheckCircle2 size={15} /> : <ClipboardCopy size={15} />}
              {copiedHash ? "Copied!" : "Copy Hash"}
            </button>
            <div className={`flex items-start gap-2 text-xs ${isDarkTheme ? "text-amber-300/90" : "text-amber-700"}`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>You'll need this hash when creating a job on TiwalaChain to verify the contract.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>

    {/* Preview Modal */}
    {showPreview && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={() => setShowPreview(false)}
        />
        <div className={`relative w-full max-w-3xl max-h-[85vh] overflow-hidden ${cardClass} p-0 animate-in zoom-in-95 duration-200`}>
          <div className={`sticky top-0 flex items-center justify-between border-b p-5 ${
            isDarkTheme ? "border-white/10 bg-[#0a0b0f]/95" : "border-slate-200 bg-white/95"
          } backdrop-blur-xl`}>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
                <Eye size={18} className="text-violet-500" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${titleClass}`}>Contract Preview</h3>
                <p className={`text-xs ${mutedTextClass}`}>Review before exporting</p>
              </div>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              className={`flex size-9 items-center justify-center rounded-lg transition-all ${
                isDarkTheme 
                  ? "text-white/50 hover:bg-white/5 hover:text-white" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <X size={20} />
            </button>
          </div>
          <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 160px)' }}>
            <pre className={`whitespace-pre-wrap rounded-xl p-5 text-sm leading-relaxed font-mono ${
              isDarkTheme 
                ? "bg-black/40 text-white/80" 
                : "bg-slate-50 text-slate-700"
            }`}>
              {compiledContractText}
            </pre>
          </div>
          <div className={`sticky bottom-0 flex items-center justify-end gap-3 border-t p-5 ${
            isDarkTheme ? "border-white/10 bg-[#0a0b0f]/95" : "border-slate-200 bg-white/95"
          } backdrop-blur-xl`}>
            <button
              onClick={() => setShowPreview(false)}
              className={secondaryBtnClass}
            >
              Close
            </button>
            <button
              onClick={() => {
                setShowPreview(false);
                exportPdf();
              }}
              className={primaryBtnClass}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export PDF
            </button>
          </div>
        </div>
      </div>
    )}

  </div>
</div>
);
}