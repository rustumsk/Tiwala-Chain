import WalletButton from "@/components/blockchain/wallet-button";
import WalletRouteGate from "@/components/blockchain/wallet-route-gate";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060a14] text-slate-100">
      <WalletRouteGate />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.24),_transparent_42%),radial-gradient(circle_at_70%_15%,_rgba(6,182,212,0.2),_transparent_28%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-20 px-6 pb-20 pt-12 md:px-12">
        <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-8 shadow-2xl shadow-cyan-500/5 backdrop-blur">
          <div className="mb-16 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/80">
                TiwalaChain
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight md:text-6xl">
                Trust-first freelancing with blockchain escrow.
              </h1>
            </div>
          </div>

          <p className="max-w-2xl text-lg leading-relaxed text-slate-300">
            A professional platform for Filipino freelancers and employers to
            create fair contracts, lock payments on-chain, and complete work
            with transparent protection for both sides.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <WalletButton label="Connect Wallet to Start" />
            <span className="inline-flex items-center rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 text-sm text-slate-300">
              Sepolia Testnet Only
            </span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Create Contract",
              description:
                "Define job scope and terms with AI fairness checks before publishing.",
            },
            {
              title: "Lock Funds",
              description:
                "Escrow funds on-chain so both freelancer and employer are protected.",
            },
            {
              title: "Get Paid",
              description:
                "Track status transparently and release payment upon work completion.",
            },
          ].map((step, idx) => (
            <article
              className="rounded-xl border border-slate-800 bg-slate-900/45 p-6"
              key={step.title}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                Step {idx + 1}
              </p>
              <h2 className="text-xl font-semibold text-slate-100">{step.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {step.description}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            "AI Contract Fairness",
            "Blockchain Escrow",
            "Transparent Disputes",
          ].map((feature) => (
            <article
              className="rounded-xl border border-slate-800/90 bg-[#081020] p-6"
              key={feature}
            >
              <h3 className="text-base font-semibold text-teal-200">{feature}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Built for trust and accountability from proposal to payout.
              </p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
