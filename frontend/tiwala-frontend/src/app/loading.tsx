"use client";

import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="themed-app-page flex min-h-screen items-center justify-center text-slate-100">
      <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-5 py-3 shadow-[0_18px_60px_rgba(15,23,42,0.6)] backdrop-blur-md">
        <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
        <p className="text-sm text-slate-200">Loading TiwalaChain…</p>
      </div>
    </div>
  );
}

