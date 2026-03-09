import OnboardingForm from "@/components/onboarding/onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="onboarding-page relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#080010] px-6 py-14 text-white md:px-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 60% 55% at 10% 10%, rgba(108,58,220,0.26) 0%, transparent 70%)",
            "radial-gradient(ellipse 60% 55% at 90% 90%, rgba(122,72,240,0.22) 0%, transparent 74%)",
            "radial-gradient(ellipse 44% 30% at 50% 100%, rgba(186,140,255,0.20) 0%, transparent 78%)",
          ].join(", "),
        }}
      />

      <section className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-white/65">
            Wallet Profile Setup
          </p>
          <h1 className="mt-6 max-w-lg text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
            Welcome to
            <span className="block text-violet-300">TiwalaChain Onboarding</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
            Create your display identity and choose your role to unlock your
            dashboard experience.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75">
              Secure wallet-based identity
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75">
              Local profile storage
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75">
              Flexible work roles
            </div>
          </div>
        </div>

        <OnboardingForm />
      </section>
    </main>
  );
}
