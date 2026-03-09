import WalletButton from "@/components/blockchain/wallet-button";

export default function UnauthorizedPage() {
  return (
    <main className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#080010] px-6 py-14 text-white md:px-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 55% 50% at 10% 10%, rgba(108,58,220,0.24) 0%, transparent 70%)",
            "radial-gradient(ellipse 55% 50% at 90% 90%, rgba(122,72,240,0.2) 0%, transparent 72%)",
            "radial-gradient(ellipse 44% 30% at 50% 100%, rgba(186,140,255,0.16) 0%, transparent 78%)",
          ].join(", "),
        }}
      />

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center rounded-3xl border border-white/15 bg-[#100720]/75 px-8 py-12 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_24px_80px_rgba(120,70,220,0.18)] backdrop-blur-md">
        <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/65">
          Authentication Required
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
          Verify your wallet to continue
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">
          Connect your wallet and sign the authentication message. If your
          account profile is not set yet, we will route you to onboarding
          automatically.
        </p>

        <div className="mt-8">
          <WalletButton
            label="Connect Wallet"
            buttonClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
            connectedClassName="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500"
            wrongNetworkClassName="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-300 transition-all duration-200 hover:border-red-400/70"
          />
        </div>
      </section>
    </main>
  );
}
