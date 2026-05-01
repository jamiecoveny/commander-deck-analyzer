"use client";

import { useState } from "react";

import type { AnalysisResult } from "@/lib/analytics";

type ApiResponse =
  | { ok: true; analysis: AnalysisResult; warnings: unknown[] }
  | { ok: false; errors: Array<Record<string, unknown>>; warnings?: unknown[] };

const SAMPLE = `// Sample — paste your own decklist
1 Atraxa, Praetors' Voice *CMDR*
1 Sol Ring
1 Cultivate
1 Counterspell
1 Wrath of God
1 Demonic Tutor
1 Reanimate
1 Rhystic Study
1 Smothering Tithe
30 Plains
30 Forest
30 Island
`;

export default function Analyzer(): JSX.Element {
  const [text, setText] = useState<string>(SAMPLE);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await r.json()) as ApiResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="deck" className="block text-sm text-zinc-400">
          Paste your decklist (one card per line; <code>1x</code> /{" "}
          <code>1</code> prefix optional; <code>*CMDR*</code> or{" "}
          <code>{"// Commander"}</code> to mark the commander)
        </label>
        <textarea
          id="deck"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          spellCheck={false}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Card data fetched live from Scryfall. First analysis of a deck
            takes a few seconds; subsequent runs hit an in-memory cache.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze deck"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && !result.ok && <ErrorPanel errors={result.errors} />}
      {result && result.ok && <ResultPanel analysis={result.analysis} />}
    </div>
  );
}

function ErrorPanel({
  errors,
}: {
  errors: Array<Record<string, unknown>>;
}): JSX.Element {
  return (
    <section className="rounded-md border border-red-900 bg-red-950/30 p-4 text-sm">
      <h2 className="font-semibold text-red-200 mb-2">
        Validation failed ({errors.length} {errors.length === 1 ? "issue" : "issues"})
      </h2>
      <ul className="space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-red-100/90 font-mono text-xs">
            {JSON.stringify(e)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultPanel({ analysis }: { analysis: AnalysisResult }): JSX.Element {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Commander
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {analysis.commander}
        </h2>
        <p className="text-sm text-zinc-400">
          Color identity:{" "}
          <span className="font-mono text-zinc-200">
            {analysis.colorIdentity || "—"}
          </span>
          {"  ·  "}
          {analysis.totalCards} cards{"  ·  "}
          {analysis.landCount} lands ({analysis.basicLandCount} basic /{" "}
          {analysis.nonbasicLandCount} non-basic){"  ·  "}
          avg CMC {analysis.averageCmc}
        </p>
      </header>

      <ArchetypeBox archetype={analysis.archetype} />

      <GamePlanBox gamePlan={analysis.gamePlan} />

      <CombosBox
        combos={analysis.combos}
        lookupFailed={analysis.comboLookupFailed}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <CurveBox manaCurve={analysis.manaCurve} />
        <PipsBox pipCount={analysis.pipCount} />
      </div>

      <CategoryBox counts={analysis.categoryCounts} />

      <CardsTable cards={analysis.cards} />

      <footer className="text-xs text-zinc-600 space-y-1">
        <p>
          Card data via Scryfall · Combos via Commander Spellbook · Classifications by built-in rules + overrides
        </p>
      </footer>
    </section>
  );
}

function GamePlanBox({ gamePlan }: { gamePlan: string }): JSX.Element {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
        Game plan
      </p>
      <p className="text-sm text-zinc-200 leading-relaxed">{gamePlan}</p>
    </section>
  );
}

function CombosBox({
  combos,
  lookupFailed,
}: {
  combos: AnalysisResult["combos"];
  lookupFailed: boolean;
}): JSX.Element {
  const inDeck = combos.filter((c) => c.completeness === "in_deck");
  const almost = combos.filter((c) => c.completeness === "almost_in_deck");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        Combos detected{" "}
        <span className="text-zinc-600">via Commander Spellbook</span>
      </p>

      {lookupFailed && (
        <p className="text-xs text-amber-300/80 mb-3">
          Spellbook lookup failed — combo detection unavailable for this run.
        </p>
      )}

      {!lookupFailed && combos.length === 0 && (
        <p className="text-xs text-zinc-500">
          No matching combos found for this decklist.
        </p>
      )}

      {inDeck.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-emerald-300 mb-2">
            In deck — all pieces present ({inDeck.length})
          </p>
          <ul className="space-y-1.5">
            {inDeck.slice(0, 8).map((c) => (
              <ComboRow key={c.spellbookId} combo={c} />
            ))}
          </ul>
        </div>
      )}

      {almost.length > 0 && (
        <div>
          <p className="text-xs text-amber-300 mb-2">
            Almost in deck — missing 1+ piece ({almost.length})
          </p>
          <ul className="space-y-1.5">
            {almost.slice(0, 8).map((c) => (
              <ComboRow key={c.spellbookId} combo={c} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ComboRow({
  combo,
}: {
  combo: AnalysisResult["combos"][number];
}): JSX.Element {
  const url = `https://commanderspellbook.com/combo/${encodeURIComponent(combo.spellbookId)}/`;
  return (
    <li className="text-xs">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-200 hover:underline"
      >
        {combo.cards.join(" + ")}
      </a>
      {combo.results.length > 0 && (
        <span className="text-zinc-500"> → {combo.results.join(" + ")}</span>
      )}
      {combo.missing.length > 0 && (
        <span className="text-amber-400/80">
          {" — needs: "}
          {combo.missing.join(", ")}
        </span>
      )}
    </li>
  );
}

function ArchetypeBox({
  archetype,
}: {
  archetype: AnalysisResult["archetype"];
}): JSX.Element {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Archetype guess (heuristic)
      </p>
      <p className="text-lg font-medium mt-1">{archetype.archetype}</p>
      <ul className="mt-2 list-disc list-inside text-xs text-zinc-400">
        {archetype.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </section>
  );
}

function CurveBox({
  manaCurve,
}: {
  manaCurve: AnalysisResult["manaCurve"];
}): JSX.Element {
  const max = Math.max(1, ...Object.values(manaCurve));
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        Mana curve (non-land)
      </p>
      <div className="space-y-1">
        {(Object.keys(manaCurve) as Array<keyof typeof manaCurve>).map((k) => {
          const n = manaCurve[k];
          const pct = (n / max) * 100;
          return (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="w-6 text-zinc-500 font-mono">{k}</span>
              <div className="flex-1 h-3 rounded bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-zinc-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-right font-mono text-zinc-200">{n}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PipsBox({
  pipCount,
}: {
  pipCount: AnalysisResult["pipCount"];
}): JSX.Element {
  const COLOR_LABELS: Record<keyof typeof pipCount, string> = {
    W: "White",
    U: "Blue",
    B: "Black",
    R: "Red",
    G: "Green",
    C: "Colorless",
  };
  const max = Math.max(1, ...Object.values(pipCount));
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        Color pip count (non-land)
      </p>
      <div className="space-y-1">
        {(Object.keys(pipCount) as Array<keyof typeof pipCount>).map((k) => {
          const n = pipCount[k];
          const pct = (n / max) * 100;
          return (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="w-16 text-zinc-500">{COLOR_LABELS[k]}</span>
              <div className="flex-1 h-3 rounded bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-zinc-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-zinc-200">{n}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CategoryBox({
  counts,
}: {
  counts: AnalysisResult["categoryCounts"];
}): JSX.Element {
  const order: Array<keyof typeof counts> = [
    "ramp",
    "draw",
    "removal",
    "wipe",
    "counterspell",
    "tutor",
    "recursion",
    "wincon",
    "stax",
    "utility",
  ];
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        Category breakdown
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {order.map((k) => (
          <div key={k} className="rounded border border-zinc-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {k}
            </p>
            <p className="text-lg font-medium font-mono">{counts[k]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardsTable({
  cards,
}: {
  cards: AnalysisResult["cards"];
}): JSX.Element {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        Cards ({cards.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th className="py-1 pr-3">Qty</th>
              <th className="py-1 pr-3">Name</th>
              <th className="py-1 pr-3">CMC</th>
              <th className="py-1 pr-3">Categories</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.oracleId} className="border-t border-zinc-900">
                <td className="py-1 pr-3 font-mono text-zinc-300">{c.quantity}</td>
                <td className="py-1 pr-3">
                  {c.name}
                  {c.isCommander && (
                    <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-200">
                      CMDR
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3 font-mono text-zinc-400">
                  {c.isLand ? "—" : c.cmc}
                </td>
                <td className="py-1 pr-3">
                  {c.categories.map((cat) => (
                    <span
                      key={cat}
                      className="mr-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                    >
                      {cat}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
