"use client";

import { useEffect, useState } from "react";

import type { AnalysisResult } from "@/lib/analytics";
import type { SimulateResponse } from "@/lib/sim";

type ApiResponse =
  | { ok: true; analysis: AnalysisResult; warnings: unknown[] }
  | { ok: false; errors: Array<Record<string, unknown>>; warnings?: unknown[] };

type SimResponse =
  | { ok: true; result: SimulateResponse }
  | { ok: false; errors: Array<Record<string, unknown>> };

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
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [simResult, setSimResult] = useState<SimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ?deck=<id> support: when arriving from "Re-analyze" on a saved
  // deck, fetch the stored decklist text and pre-fill the textarea.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("deck");
    if (!id) return;
    fetch(`/api/decks/${id}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; decklistText?: string }) => {
        if (data.ok && data.decklistText) setText(data.decklistText);
      })
      .catch(() => {
        /* silent — user can still paste manually */
      });
  }, []);

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

  async function onSimulate(games: number): Promise<void> {
    setSimLoading(true);
    setSimResult(null);
    try {
      const r = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, games }),
      });
      const data = (await r.json()) as SimResponse;
      setSimResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "simulate failed");
    } finally {
      setSimLoading(false);
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

      {result && result.ok && (
        <SaveDeckBox
          analysis={result.analysis}
          decklistText={text}
          defaultName={result.analysis.commander}
        />
      )}

      {result && result.ok && (
        <SimPanel
          loading={simLoading}
          onRun={onSimulate}
          response={simResult}
        />
      )}
    </div>
  );
}

function SaveDeckBox({
  analysis,
  decklistText,
  defaultName,
}: {
  analysis: AnalysisResult;
  decklistText: string;
  defaultName: string;
}): JSX.Element {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || defaultName,
          text: decklistText,
          analysis,
        }),
      });
      const data = (await r.json()) as
        | { ok: true; deck: { id: string } }
        | { ok: false; error: string };
      if (!data.ok) throw new Error(data.error);
      setSaved({ id: data.deck.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <section className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm">
        <p className="text-emerald-200">
          Saved.{" "}
          <a
            href={`/library/${saved.id}`}
            className="underline hover:text-white"
          >
            View in library →
          </a>
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
        Save to library
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Deck name"
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-300">Couldn&apos;t save: {error}</p>
      )}
    </section>
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

      <BracketBadge estimate={analysis.bracketEstimate} />

      <ArchetypeBox archetype={analysis.archetype} />

      <GamePlanBox gamePlan={analysis.gamePlan} />

      <CombosBox
        combos={analysis.combos}
        lookupFailed={analysis.comboLookupFailed}
      />

      <RecommendationsBox recs={analysis.recommendations} />

      {analysis.edhrec && <EdhrecCompareBox edhrec={analysis.edhrec} />}

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

function SimPanel({
  loading,
  onRun,
  response,
}: {
  loading: boolean;
  onRun: (games: number) => void | Promise<void>;
  response: SimResponse | null;
}): JSX.Element {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Playtest simulator
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Heuristic — coarse approximation, not a deterministic prediction.
            Opponents: 3× Bracket-3 generic midrange.
          </p>
        </div>
        <div className="flex gap-2">
          {[1, 5, 10].map((n) => (
            <button
              key={n}
              type="button"
              disabled={loading}
              onClick={() => onRun(n)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Running…" : `Run ${n}`}
            </button>
          ))}
        </div>
      </div>

      {response && !response.ok && (
        <div className="rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-100/80">
          {JSON.stringify(response.errors)}
        </div>
      )}

      {response && response.ok && <SimResults result={response.result} />}
    </section>
  );
}

function SimResults({
  result,
}: {
  result: SimulateResponse;
}): JSX.Element {
  const a = result.aggregate;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Win rate" value={`${(a.winRate * 100).toFixed(0)}%`} />
        <Stat label="Avg turns" value={a.avgTurns.toFixed(1)} />
        <Stat
          label="Avg cmdr turn"
          value={a.avgCommanderTurn != null ? a.avgCommanderTurn.toFixed(1) : "—"}
        />
        <Stat
          label="Avg wincon turn"
          value={a.avgFirstWinconTurn != null ? a.avgFirstWinconTurn.toFixed(1) : "—"}
        />
        <Stat label="Mull rate" value={a.mulliganRate.toFixed(2)} />
      </div>

      {Object.keys(a.failureModes).length > 0 && (
        <div className="text-xs">
          <p className="text-zinc-500 mb-1">Failure modes:</p>
          <ul className="list-disc list-inside text-zinc-300">
            {Object.entries(a.failureModes).map(([reason, n]) => (
              <li key={reason}>
                {reason}: {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
          Per-game logs ({result.games.length} game
          {result.games.length === 1 ? "" : "s"})
        </summary>
        <div className="mt-2 space-y-3">
          {result.games.map((g, i) => (
            <div
              key={i}
              className="rounded border border-zinc-800 p-2 max-h-48 overflow-y-auto font-mono text-[10px]"
            >
              <p className="text-zinc-500 mb-1">
                Game {i + 1} — winner: {g.winner ?? "stalemate"}, turns: {g.turns}
              </p>
              {g.log.slice(0, 80).map((e, j) => (
                <p key={j} className="text-zinc-400">
                  T{e.turn} {e.playerId}: {e.text}
                </p>
              ))}
              {g.log.length > 80 && (
                <p className="text-zinc-600">… {g.log.length - 80} more events</p>
              )}
            </div>
          ))}
        </div>
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
          Caveats
        </summary>
        <ul className="mt-1 list-disc list-inside text-zinc-500 space-y-0.5">
          {result.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded border border-zinc-800 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="text-base font-medium font-mono">{value}</p>
    </div>
  );
}

function RecommendationsBox({
  recs,
}: {
  recs: AnalysisResult["recommendations"];
}): JSX.Element {
  if (recs.length === 0) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Recommendations
        </p>
        <p className="text-sm text-zinc-500">
          No recommendations — your deck matches commander staples well, or
          EDHrec/Spellbook didn&apos;t return data for this commander.
        </p>
      </section>
    );
  }
  const byTier: Record<number, typeof recs> = { 1: [], 2: [], 3: [] };
  for (const r of recs) byTier[r.tier]?.push(r);

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Recommendations
      </p>
      {byTier[1] && byTier[1].length > 0 && (
        <TierGroup
          label="Must fix"
          color="red"
          recs={byTier[1]}
        />
      )}
      {byTier[2] && byTier[2].length > 0 && (
        <TierGroup
          label="Strong upgrades"
          color="emerald"
          recs={byTier[2]}
        />
      )}
      {byTier[3] && byTier[3].length > 0 && (
        <TierGroup
          label="Nice to have"
          color="zinc"
          recs={byTier[3]}
        />
      )}
    </section>
  );
}

function TierGroup({
  label,
  color,
  recs,
}: {
  label: string;
  color: "red" | "emerald" | "zinc";
  recs: AnalysisResult["recommendations"];
}): JSX.Element {
  const headingColor =
    color === "red"
      ? "text-red-300"
      : color === "emerald"
        ? "text-emerald-300"
        : "text-zinc-400";
  return (
    <div>
      <p className={`text-xs ${headingColor} mb-2`}>
        {label} ({recs.length})
      </p>
      <ul className="space-y-2">
        {recs.map((r, i) => (
          <li key={i} className="text-xs">
            <p className="text-zinc-200">{r.title}</p>
            <p className="text-zinc-500 text-[11px]">
              {r.reason}
              {r.source === "edhrec" && (
                <span className="ml-1 text-zinc-600">via EDHrec</span>
              )}
              {r.source === "spellbook" && (
                <span className="ml-1 text-zinc-600">via Spellbook</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EdhrecCompareBox({
  edhrec,
}: {
  edhrec: NonNullable<AnalysisResult["edhrec"]>;
}): JSX.Element {
  const t = edhrec.averageTypeCounts;
  const rows: Array<[string, number]> = [
    ["Creatures", t.creature],
    ["Instants", t.instant],
    ["Sorceries", t.sorcery],
    ["Artifacts", t.artifact],
    ["Enchantments", t.enchantment],
    ["Planeswalkers", t.planeswalker],
    ["Lands (basic)", t.basic],
    ["Lands (nonbasic)", t.nonbasic],
  ];
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        EDHrec average for this commander{" "}
        <span className="text-zinc-600">
          ({edhrec.numDecks.toLocaleString()} decks tracked)
        </span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded border border-zinc-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className="text-base font-mono">{value.toFixed(1)}</p>
          </div>
        ))}
      </div>
      {edhrec.similarCommanders.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          Similar commanders: {edhrec.similarCommanders.slice(0, 5).join(", ")}
        </p>
      )}
    </section>
  );
}

function BracketBadge({
  estimate,
}: {
  estimate: AnalysisResult["bracketEstimate"];
}): JSX.Element {
  const colors: Record<number, string> = {
    1: "bg-emerald-900/40 text-emerald-200 border-emerald-800",
    2: "bg-blue-900/40 text-blue-200 border-blue-800",
    3: "bg-amber-900/40 text-amber-200 border-amber-800",
    4: "bg-orange-900/40 text-orange-200 border-orange-800",
  };
  const names: Record<number, string> = {
    1: "Exhibition",
    2: "Core",
    3: "Upgraded",
    4: "Optimized",
  };
  const cls = colors[estimate.bracket] ?? "bg-zinc-900 text-zinc-200 border-zinc-800";
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
        Bracket estimate
      </p>
      <div className="flex items-center gap-3">
        <span
          className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${cls}`}
        >
          Bracket {estimate.bracket} — {names[estimate.bracket]}
        </span>
      </div>
      {estimate.reasons.length > 0 && (
        <ul className="mt-3 list-disc list-inside text-xs text-zinc-400 space-y-0.5">
          {estimate.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-zinc-600">
        Bracket 5 (cEDH) is never auto-tagged — it&apos;s a self-claimed archetype.
      </p>
    </section>
  );
}
