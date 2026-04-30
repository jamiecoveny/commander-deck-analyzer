export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16 sm:px-12 sm:py-24 max-w-3xl mx-auto">
      <header className="mb-12">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
          Commander Deck Analyzer
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          Paste a decklist. Get the diagnosis.
        </h1>
        <p className="mt-4 text-zinc-400 leading-relaxed">
          Mana curve, ramp/draw/removal counts, EDHrec comparison, combo
          detection, bracket estimate, and a heuristic playtest simulator —
          for mid-bracket EDH players. Pricing in CAD via Face à Face Games.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-8">
        <p className="text-sm text-zinc-500">
          Decklist input UI is wired up in Phase 1, Step 3.
        </p>
      </section>

      <footer className="mt-16 text-xs text-zinc-600 space-y-1">
        <p>Card data via Scryfall · Combos via Commander Spellbook · Inclusion data via EDHrec</p>
        <p>Phase 1 — MVP scaffold</p>
      </footer>
    </main>
  );
}
