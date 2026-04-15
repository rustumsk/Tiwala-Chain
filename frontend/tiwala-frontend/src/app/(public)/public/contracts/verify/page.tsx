"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, FileSearch, Loader2, ShieldAlert } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";
import {
  verifyPublicContract,
  type PublicContractVerificationResponse,
} from "@/lib/public-services";

function tone(status: string) {
  if (status === "Verified") {
    return {
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
    };
  }

  return {
    icon: ShieldAlert,
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
  };
}

export default function PublicContractVerifyPage() {
  const {
    panelClass,
    mutedTextClass,
    titleClass,
    pageClass,
    chipClass,
    actionChipClass,
    inputClass,
  } = useThemeStyles();

  const [contractHash, setContractHash] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PublicContractVerificationResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError("");
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await verifyPublicContract({ contractHash, file });
      setResult(response);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const resultTone = result ? tone(result.status) : null;

  return (
    <div className={`mx-auto min-h-screen w-full max-w-5xl px-4 py-10 ${pageClass}`}>
      <section className={`${panelClass} rounded-2xl px-6 py-7`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`${actionChipClass} inline-flex rounded-full px-3 py-1 text-xs font-semibold`}>
              Public verification
            </span>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${titleClass}`}>
                Verify a contract hash
              </h1>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>
                Paste a contract hash, upload the original file, or do both. TiwalaChain checks whether the hash exists in platform records and whether the uploaded file matches it.
              </p>
            </div>
          </div>

          <Link href="/" className={`${chipClass} rounded-full px-4 py-2 text-sm transition hover:border-violet-300 hover:bg-violet-500/10`}>
            Connect wallet
          </Link>
        </div>
      </section>

      <section className={`${panelClass} mt-6 rounded-2xl p-6`}>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                Contract hash
              </label>
              <input
                className={inputClass}
                value={contractHash}
                onChange={(event) => setContractHash(event.target.value)}
                placeholder="0xabc123..."
              />
              <p className={`mt-2 text-xs ${mutedTextClass}`}>
                Optional if you upload a file. SHA-256 hashes are supported with or without the `0x` prefix.
              </p>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${titleClass}`}>
                Contract file
              </label>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className={`${inputClass} h-auto py-3`}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className={`mt-2 text-xs ${mutedTextClass}`}>
                Anonymous verification supports PDF or DOCX files up to 3 MB.
              </p>
            </div>

            <button
              type="button"
              className={`${actionChipClass} inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold`}
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? (
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

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          <div className={`${panelClass} rounded-2xl border-dashed p-5`}>
            <h2 className={`text-lg font-semibold ${titleClass}`}>What this means</h2>
            <ul className={`mt-3 space-y-3 text-sm leading-6 ${mutedTextClass}`}>
              <li>`Verified` means the hash matches a contract already recorded in TiwalaChain.</li>
              <li>`Not Found` means the hash was valid but no matching contract record was found.</li>
              <li>`Mismatch` means the uploaded file does not match the hash you provided.</li>
            </ul>
          </div>
        </div>
      </section>

      {result ? (
        <section className={`${resultTone?.className} mt-6 rounded-2xl border p-6`}>
          <div className="flex items-start gap-3">
            {resultTone ? <resultTone.icon size={18} className="mt-0.5 shrink-0" /> : null}
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                  {result.status}
                </p>
                <p className="mt-1 text-sm leading-6">{result.message}</p>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <p className="font-semibold">Matched hash</p>
                  <p className="mt-1 break-all opacity-90">{result.matchedHash}</p>
                </div>
                {result.uploadedHash ? (
                  <div>
                    <p className="font-semibold">Uploaded file hash</p>
                    <p className="mt-1 break-all opacity-90">{result.uploadedHash}</p>
                  </div>
                ) : null}
              </div>

              {result.metadata ? (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="font-semibold">Recorded title</p>
                    <p className="mt-1 opacity-90">{result.metadata.title}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Job status</p>
                    <p className="mt-1 opacity-90">{result.metadata.jobStatus}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Employer</p>
                    <p className="mt-1 opacity-90">{result.metadata.employerWallet}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Freelancer</p>
                    <p className="mt-1 opacity-90">{result.metadata.freelancerWallet}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
