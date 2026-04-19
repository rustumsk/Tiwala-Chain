"use client";

import Link from "next/link";
import { LockKeyhole, X } from "lucide-react";
import { useThemeStyles } from "@/hooks/use-theme-styles";

type FreeTriesModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
};

export default function FreeTriesModal({
  open,
  onClose,
  title = "Free tries used",
  message = "You've reached the number of free tries. Log in to use more.",
}: FreeTriesModalProps) {
  const { panelClass, mutedTextClass, titleClass, actionChipClass, chipClass, isDarkTheme } =
    useThemeStyles();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close rate limit message"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`${panelClass} relative w-full max-w-md rounded-2xl p-6 shadow-2xl`}>
        <button
          type="button"
          aria-label="Close"
          className={`absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-xl transition ${
            isDarkTheme
              ? "text-white/60 hover:bg-white/10 hover:text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          }`}
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className={`${actionChipClass} inline-flex rounded-2xl p-3`}>
          <LockKeyhole size={20} />
        </div>
        <h2 className={`mt-4 text-xl font-semibold ${titleClass}`}>{title}</h2>
        <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>{message}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className={`${actionChipClass} inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold`}
          >
            Log in
          </Link>
          <button
            type="button"
            className={`${chipClass} inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold`}
            onClick={onClose}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
