"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  FileSearch,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import { useEmployerJobs, useFreelancerJobs } from "@/hooks/use-escrow-jobs";
import { getStoredProfile } from "@/lib/profile";
import { JOB_STATUS_LABEL } from "@/lib/contract";
import { normalizeContractHashForApi } from "@/lib/jobs";
import type { EscrowJob } from "@/types";

type VerificationState =
  | { status: "idle" }
  | { status: "success"; uploadedHash: string; onChainHash: string }
  | { status: "mismatch"; uploadedHash: string; onChainHash: string }
  | { status: "error"; message: string };

function formatUsdt(amount: bigint) {
  return (Number(amount) / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function shortAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function jobTitle(job: EscrowJob) {
  return job.title?.trim() || `Job #${job.id.toString()}`;
}

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function VerifyContractPage() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const {
    isDarkTheme,
    panelClass,
    subtlePanelClass,
    mutedTextClass,
    tinyLabelClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
  } = useThemeStyles();

  const [selectedJobId, setSelectedJobId] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
  });

  const profile = useMemo(() => {
    if (!isConnected || !address || typeof window === "undefined") return null;
    const existing = getStoredProfile();
    if (!existing) return null;
    return existing.wallet.toLowerCase() === address.toLowerCase() ? existing : null;
  }, [address, isConnected]);

  const showEmployerList = profile?.role === "employer" || profile?.role === "both";
  const showFreelancerList = profile?.role === "freelancer" || profile?.role === "both";

  const employerJobs = useEmployerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showEmployerList),
  });

  const freelancerJobs = useFreelancerJobs({
    walletAddress: address,
    enabled: Boolean(isConnected && address && showFreelancerList),
  });

  const availableJobs = useMemo(() => {
    const merged = [...employerJobs.jobs, ...freelancerJobs.jobs];
    const unique = new Map<string, EscrowJob>();
    merged.forEach((job) => {
      unique.set(job.id.toString(), job);
    });
    return Array.from(unique.values()).sort((a, b) => Number(b.id - a.id));
  }, [employerJobs.jobs, freelancerJobs.jobs]);

  useEffect(() => {
    const requestedId = searchParams.get("jobId");
    if (!requestedId) return;
    if (availableJobs.some((job) => job.id.toString() === requestedId)) {
      setSelectedJobId(requestedId);
    }
  }, [availableJobs, searchParams]);

  const selectedJob = useMemo(
    () => availableJobs.find((job) => job.id.toString() === selectedJobId) ?? null,
    [availableJobs, selectedJobId]
  );

  const fileInputClass = isDarkTheme
    ? "block w-full rounded-xl border border-white/14 bg-black/40 p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.06] file:px-3 file:py-2 file:text-white/90 hover:file:bg-white/[0.1]"
    : "block w-full rounded-xl border border-[#e1e4f0] bg-[#fafbff] p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[#e8ecf4] file:px-3 file:py-2 file:text-[#2a3040] hover:file:bg-[#dce2f0]";

  const secondaryButtonClass = isDarkTheme
    ? "inline-flex h-11 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] px-5 text-sm font-semibold text-white/90 transition hover:border-violet-300/40 hover:bg-violet-500/12"
    : "inline-flex h-11 items-center justify-center rounded-xl border border-[#d8dced] bg-white px-5 text-sm font-semibold text-[#242838] transition hover:border-violet-300 hover:bg-violet-50";

  const primaryButtonClass = `${actionChipClass} inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition hover:border-violet-300/50 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60`;

  const handleVerify = async () => {
    if (!selectedJob) {
      setVerification({ status: "error", message: "Select a job first." });
      return;
    }
    if (!contractFile) {
      setVerification({ status: "error", message: "Upload the contract file you want to verify." });
      return;
    }

    setIsVerifying(true);
    try {
      const uploadedHash = await sha256Hex(contractFile);
      const onChainHash = normalizeContractHashForApi(selectedJob.contractHash);
      setVerification(
        uploadedHash === onChainHash
          ? { status: "success", uploadedHash, onChainHash }
          : { status: "mismatch", uploadedHash, onChainHash }
      );
    } catch (error) {
      setVerification({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to hash the uploaded file for verification.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isConnected) {
    return (
      <div className={pageClass}>
        <section className={`mx-auto w-full max-w-[1580px] ${panelClass} rounded-xl px-6 py-8 lg:px-8 lg:py-9`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
            Contract verification
          </p>
          <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
            Connect wallet to verify a contract
          </h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 ${mutedTextClass}`}>
            Signed-in users can verify a contract against the on-chain hash from their current jobs.
          </p>
        </section>
      </div>
    );
  }

  const resultTone =
    verification.status === "success"
      ? isDarkTheme
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"
      : verification.status === "mismatch"
        ? isDarkTheme
          ? "border-red-400/30 bg-red-500/10 text-red-200"
          : "border-red-200 bg-red-50 text-red-800"
        : isDarkTheme
          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={pageClass}>
      <section className="mx-auto w-full max-w-[1580px] space-y-5">
        <article className={`${panelClass} rounded-xl px-6 py-6 lg:px-8 lg:py-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500/80">
                Contract verification
              </p>
              <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${titleClass}`}>
                Verify from one of your jobs
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Pick a current job, upload the original contract file, and compare its SHA-256 file hash to the hash stored on-chain.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`${chipClass} rounded-full px-3 py-1`}>
                {availableJobs.length} available jobs
              </span>
              <span className={`${actionChipClass} rounded-full px-3 py-1`}>
                Signed-in verification
              </span>
            </div>
          </div>
        </article>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Step 1</p>
            <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
              Select a job
            </h2>
            <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
              The verification uses the contract hash already stored on-chain for the selected job.
            </p>

            {availableJobs.length === 0 ? (
              <div className={`${subtlePanelClass} mt-5 rounded-xl p-5`}>
                <p className={`text-sm ${mutedTextClass}`}>
                  No on-chain jobs were found for your wallet yet. Once a job is created on-chain, it can be verified here.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/jobs" className={secondaryButtonClass}>
                    Open jobs
                  </Link>
                  <Link href="/dashboard" className={primaryButtonClass}>
                    Go to dashboard
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                    Current job
                  </label>
                  <select
                    value={selectedJobId}
                    onChange={(event) => {
                      setSelectedJobId(event.target.value);
                      setVerification({ status: "idle" });
                    }}
                    className={`${subtlePanelClass} h-11 w-full rounded-xl px-4 text-sm outline-none ${
                      isDarkTheme ? "text-white" : "text-[#11131b]"
                    }`}
                  >
                    <option value="">Select a job to verify</option>
                    {availableJobs.map((job) => (
                      <option key={job.id.toString()} value={job.id.toString()}>
                        {jobTitle(job)} · #{job.id.toString()}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedJob ? (
                  <div className={`${subtlePanelClass} mt-5 rounded-xl p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${titleClass}`}>{jobTitle(selectedJob)}</p>
                        {selectedJob.description ? (
                          <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                            {selectedJob.description}
                          </p>
                        ) : null}
                      </div>
                      <span className={`${chipClass} rounded-full px-3 py-1 text-xs`}>
                        {JOB_STATUS_LABEL[selectedJob.status]}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>On-chain job</p>
                        <p className={`mt-1 text-sm font-semibold ${titleClass}`}>#{selectedJob.id.toString()}</p>
                      </div>
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Escrow</p>
                        <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{formatUsdt(selectedJob.amount)} USDT</p>
                      </div>
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Employer</p>
                        <p className={`mt-1 text-sm ${mutedTextClass}`}>{shortAddress(selectedJob.employer)}</p>
                      </div>
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>Freelancer</p>
                        <p className={`mt-1 text-sm ${mutedTextClass}`}>{shortAddress(selectedJob.freelancer)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </article>

          <article className={`${panelClass} rounded-xl p-6 lg:p-7`}>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${tinyLabelClass}`}>Step 2</p>
            <h2 className={`mt-2 text-xl font-semibold tracking-tight ${titleClass}`}>
              Upload and verify
            </h2>
            <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
              Upload the original PDF or DOCX file used for that job. The page hashes the exact file bytes and compares them to the on-chain contract hash.
            </p>

            <div className="mt-5">
              <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                Contract file
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className={fileInputClass}
                onChange={(event) => {
                  setContractFile(event.target.files?.[0] ?? null);
                  setVerification({ status: "idle" });
                }}
              />
              <p className={`mt-2 text-xs ${mutedTextClass}`}>
                Re-exported files may hash differently even if the wording looks the same. Verification works on the exact file bytes.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={!selectedJob || !contractFile || isVerifying}
                onClick={() => void handleVerify()}
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <FileSearch size={16} />
                    Verify contract
                  </>
                )}
              </button>
              {selectedJob ? (
                <Link
                  href={`/jobs/${selectedJob.id.toString()}`}
                  className={secondaryButtonClass}
                >
                  Open selected job
                </Link>
              ) : null}
            </div>

            {verification.status !== "idle" ? (
              <div className={`mt-5 rounded-xl border p-5 ${resultTone}`}>
                <div className="flex items-start gap-3">
                  {verification.status === "success" ? (
                    <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                  ) : verification.status === "mismatch" ? (
                    <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {verification.status === "success"
                        ? "Verified against on-chain contract hash"
                        : verification.status === "mismatch"
                          ? "Uploaded file does not match the on-chain contract hash"
                          : "Verification could not be completed"}
                    </p>
                    {verification.status === "error" ? (
                      <p className="mt-1 text-sm">{verification.message}</p>
                    ) : null}
                    {verification.status === "success" || verification.status === "mismatch" ? (
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                            On-chain hash
                          </p>
                          <p className="mt-1 break-all font-mono text-xs">
                            {verification.onChainHash}
                          </p>
                        </div>
                        <div>
                          <p className={`text-[11px] uppercase tracking-[0.16em] ${tinyLabelClass}`}>
                            Uploaded file hash
                          </p>
                          <p className="mt-1 break-all font-mono text-xs">
                            {verification.uploadedHash}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${subtlePanelClass} mt-5 rounded-xl p-5`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 inline-flex size-9 items-center justify-center rounded-xl ${chipClass}`}>
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${titleClass}`}>
                      Ready to verify when you are
                    </p>
                    <p className={`mt-1 text-sm ${mutedTextClass}`}>
                      Choose a current job first, then upload the original contract file to compare it against the hash already recorded on-chain.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
