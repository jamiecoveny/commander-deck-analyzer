// /compare?a=<deckId>&b=<deckId> — side-by-side analytics for two of
// the current session's saved decks.

import Link from "next/link";

import type { AnalysisResult } from "@/lib/analytics";
import { prisma } from "@/lib/db/client";
import { getOrCreateSessionUser } from "@/lib/session";
import CompareControls from "@/components/CompareControls";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

interface DeckSummary {
  id: string;
  name: string;
  commander: string;
  colorIdentity: string;
  archetype: string | null;
}

interface DeckWithAnalysis {
  summary: DeckSummary;
  analysis: AnalysisResult | null;
}

interface SavedAnalysisBlob {
  full: AnalysisResult;
}

async function loadDeckForUser(
  userId: string,
  id: string,
): Promise<DeckWithAnalysis | null> {
  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!deck) return null;
  let analysis: AnalysisResult | null = null;
  const latest = deck.analyses[0];
  if (latest) {
    try {
      const raw = JSON.parse(latest.recommendations as string) as SavedAnalysisBlob;
      analysis = raw.full;
    } catch {
      analysis = null;
    }
  }
  return {
    summary: {
      id: deck.id,
      name: deck.name,
      commander: deck.commander,
      colorIdentity: deck.colorIdentity,
      archetype: deck.archetype,
    },
    analysis,
  };
}

export default async function ComparePage(props: PageProps): Promise<JSX.Element> {
  const sp = await props.searchParams;
  const { userId } = await getOrCreateSessionUser();

  const allDecks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      commander: true,
      colorIdentity: true,
      archetype: true,
    },
  });

  const a = sp.a ? await loadDeckForUser(userId, sp.a) : null;
  const b = sp.b ? await loadDeckForUser(userId, sp.b) : null;

  return (
    <main className="min-h-screen px-6 py-12 sm:px-12 sm:py-16 max-w-6xl mx-auto">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
            Compare
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Side-by-side analytics
          </h1>
        </div>
        <nav className="text-sm space-x-4">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            Analyze
          </Link>
          <Link href="/library" className="text-zinc-400 hover:text-zinc-200">
            Library
          </Link>
        </nav>
      </header>

      <CompareControls
        decks={allDecks}
        selectedA={sp.a ?? ""}
        selectedB={sp.b ?? ""}
      />

      {a && b ? (
        <CompareGrid a={a} b={b} />
      ) : (
        <p className="mt-6 text-sm text-zinc-500">
          Pick two saved decks above to compare them.
        </p>
      )}
    </main>
  );
}

function CompareGrid({
  a,
  b,
}: {
  a: DeckWithAnalysis;
  b: DeckWithAnalysis;
}): JSX.Element {
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <DeckColumn deck={a} />
      <DeckColumn deck={b} />
    </div>
  );
}

function DeckColumn({ deck }: { deck: DeckWithAnalysis }): JSX.Element {
  const a = deck.analysis;
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
      <header>
        <h2 className="text-base font-semibold">{deck.summary.name}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          {deck.summary.commander}
          {"  ·  "}
          <span className="font-mono">{deck.summary.colorIdentity || "—"}</span>
          {deck.summary.archetype && <>{"  ·  "}{deck.summary.archetype}</>}
        </p>
      </header>

      {!a ? (
        <p className="text-xs text-zinc-500">Stale analysis row — re-analyze.</p>
      ) : (
        <>
          <Stat label="Total cards" value={String(a.totalCards)} />
          <Stat
            label="Lands (basic / nonbasic)"
            value={`${a.landCount} (${a.basicLandCount} / ${a.nonbasicLandCount})`}
          />
          <Stat label="Avg CMC (non-land)" value={a.averageCmc.toFixed(2)} />

          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Categories
            </p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <CompareRow label="Ramp" value={a.categoryCounts.ramp} />
              <CompareRow label="Draw" value={a.categoryCounts.draw} />
              <CompareRow label="Removal" value={a.categoryCounts.removal} />
              <CompareRow label="Wipes" value={a.categoryCounts.wipe} />
              <CompareRow label="Counters" value={a.categoryCounts.counterspell} />
              <CompareRow label="Tutors" value={a.categoryCounts.tutor} />
              <CompareRow label="Recursion" value={a.categoryCounts.recursion} />
              <CompareRow label="Wincons" value={a.categoryCounts.wincon} />
              <CompareRow label="Stax" value={a.categoryCounts.stax} />
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Game plan
            </p>
            <p className="text-xs text-zinc-300 leading-relaxed">{a.gamePlan}</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Combos detected
            </p>
            <p className="text-xs text-zinc-300">
              {a.combos.filter((c) => c.completeness === "in_deck").length} in
              deck,{" "}
              {a.combos.filter((c) => c.completeness === "almost_in_deck").length} almost
            </p>
          </div>
        </>
      )}
    </section>
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
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}

function CompareRow({
  label,
  value,
}: {
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between border-l border-zinc-800 pl-2">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}
