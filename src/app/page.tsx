import Analyzer from "@/components/Analyzer";

export default function Home(): JSX.Element {
  return (
    <main className="min-h-screen px-6 py-12 sm:px-12 sm:py-16 max-w-5xl mx-auto">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Commander Deck Analyzer
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Paste a decklist. Get the diagnosis.
        </h1>
        <p className="mt-3 text-sm text-zinc-400 max-w-2xl leading-relaxed">
          Mana curve, ramp / draw / removal counts, color identity check,
          combo detection (Phase 2), bracket estimate (Phase 2), and a heuristic
          archetype guess. Mid-bracket EDH (2–3) by default. Pricing in CAD
          via Face à Face Games comes in Phase 3.
        </p>
      </header>

      <Analyzer />
    </main>
  );
}
