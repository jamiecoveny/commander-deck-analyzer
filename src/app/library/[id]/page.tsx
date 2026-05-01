// /library/[id] — a single saved deck. Renders the analysis snapshot
// captured at save time (no live re-fetch of Scryfall/Spellbook/EDHrec
// for revisits — that's the whole point of saving).

import Link from "next/link";
import { notFound } from "next/navigation";

import type { AnalysisResult } from "@/lib/analytics";
import { prisma } from "@/lib/db/client";
import { getOrCreateSessionUser } from "@/lib/session";
import SavedDeckView from "@/components/SavedDeckView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

interface SavedAnalysisBlob {
  decklistText?: string;
  full: AnalysisResult;
}

export default async function SavedDeckPage(props: PageProps): Promise<JSX.Element> {
  const { id } = await props.params;
  const { userId } = await getOrCreateSessionUser();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!deck) notFound();

  const latest = deck.analyses[0];
  let analysis: AnalysisResult | null = null;
  let decklistText = "";
  if (latest) {
    try {
      const raw = JSON.parse(latest.recommendations as string) as SavedAnalysisBlob;
      analysis = raw.full;
      decklistText = raw.decklistText ?? "";
    } catch {
      // Stale row — render skeleton.
    }
  }

  return (
    <main className="min-h-screen px-6 py-12 sm:px-12 sm:py-16 max-w-5xl mx-auto">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
            Saved deck
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{deck.name}</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Saved {new Date(deck.createdAt).toLocaleString()}
          </p>
        </div>
        <nav className="text-sm space-x-4">
          <Link href="/library" className="text-zinc-400 hover:text-zinc-200">
            ← Library
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            Analyze
          </Link>
        </nav>
      </header>

      <SavedDeckView
        deckId={deck.id}
        analysis={analysis}
        decklistText={decklistText}
      />
    </main>
  );
}
