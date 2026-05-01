"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AnalysisResult } from "@/lib/analytics";

interface Props {
  deckId: string;
  analysis: AnalysisResult | null;
  decklistText: string;
}

export default function SavedDeckView({
  deckId,
  analysis,
  decklistText,
}: Props): JSX.Element {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete(): Promise<void> {
    if (!confirm("Delete this saved deck?")) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
      if (r.ok) router.push("/library");
    } finally {
      setDeleting(false);
    }
  }

  if (!analysis) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-6 space-y-3">
        <p className="text-sm text-zinc-400">
          Couldn&apos;t load the saved analysis (the row format may have
          changed since this deck was saved).
        </p>
        {decklistText && (
          <DecklistTextarea text={decklistText} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
        <header>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Commander
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            {analysis.commander}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            <span className="font-mono">{analysis.colorIdentity || "—"}</span>
            {"  ·  "}
            {analysis.totalCards} cards
            {"  ·  "}
            {analysis.landCount} lands
            {"  ·  "}
            avg CMC {analysis.averageCmc}
          </p>
        </header>

        <p className="text-sm text-zinc-200 leading-relaxed">
          {analysis.gamePlan}
        </p>
      </section>

      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Recommendations ({analysis.recommendations.length})
        </p>
        {analysis.recommendations.length === 0 ? (
          <p className="text-xs text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-1.5">
            {analysis.recommendations.slice(0, 12).map((r, i) => (
              <li key={i} className="text-xs">
                <span className="text-zinc-200">{r.title}</span>
                <span className="text-zinc-500"> — {r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Decklist
        </p>
        <DecklistTextarea text={decklistText} />
      </section>

      <div className="flex items-center gap-3">
        <Link
          href={`/?deck=${deckId}`}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Re-analyze
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function DecklistTextarea({ text }: { text: string }): JSX.Element {
  return (
    <textarea
      readOnly
      value={text}
      rows={Math.min(20, Math.max(6, text.split("\n").length))}
      className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300"
    />
  );
}
