// /api/decks — POST to save a deck (with its current Analysis snapshot)
// and GET to list the current session's saved decks.

import { NextResponse } from "next/server";
import { z } from "zod";

import type { AnalysisResult } from "@/lib/analytics";
import { prisma } from "@/lib/db/client";
import { getOrCreateSessionUser } from "@/lib/session";

export const runtime = "nodejs";

// We deliberately don't validate the shape of the analysis JSON deeply
// here — it's our own AnalysisResult type that the client just got back
// from /api/analyze. Storing it round-trip keeps /library cheap (no
// re-fetches of Scryfall / Spellbook / EDHrec to render the dashboard).
const AnalysisOpaque = z.unknown();

const SaveDeckSchema = z.object({
  name: z.string().min(1).max(120),
  text: z.string().min(1).max(50_000),
  analysis: AnalysisOpaque,
});

interface ErrorBody {
  ok: false;
  error: string;
  detail?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorBody>(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const parsed = SaveDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ErrorBody>(
      { ok: false, error: "validation_failed", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { userId } = await getOrCreateSessionUser();
  const analysis = parsed.data.analysis as AnalysisResult;

  // Build the Deck row from the analysis. Source-of-truth for commander
  // and color identity is the analysis we just stored — they match
  // what's already validated upstream.
  const deck = await prisma.deck.create({
    data: {
      userId,
      name: parsed.data.name,
      commander: analysis.commander ?? "Unknown",
      colorIdentity: analysis.colorIdentity ?? "",
      archetype: analysis.archetype?.archetype ?? null,
      sourceUrl: null,
      // We persist the full analysis blob on the Analysis row, plus
      // category counts on dedicated columns for fast list queries.
      cards: {
        create: (analysis.cards ?? []).map((c) => ({
          cardName: c.name,
          oracleId: c.oracleId,
          quantity: c.quantity,
          isCommander: c.isCommander,
        })),
      },
      analyses: {
        create: {
          bracketEstimate: 0, // bracket detection is a future task
          rampCount: analysis.categoryCounts?.ramp ?? 0,
          drawCount: analysis.categoryCounts?.draw ?? 0,
          removalCount: analysis.categoryCounts?.removal ?? 0,
          wipesCount: analysis.categoryCounts?.wipe ?? 0,
          countersCount: analysis.categoryCounts?.counterspell ?? 0,
          avgCmc: analysis.averageCmc ?? 0,
          combos: JSON.stringify(analysis.combos ?? []),
          recommendations: JSON.stringify({
            decklistText: parsed.data.text,
            recommendations: analysis.recommendations ?? [],
            full: analysis,
          }),
        },
      },
    },
    select: { id: true, name: true, commander: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, deck });
}

export async function GET(): Promise<Response> {
  const { userId } = await getOrCreateSessionUser();
  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      commander: true,
      colorIdentity: true,
      archetype: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { cards: true } },
    },
  });
  return NextResponse.json({ ok: true, decks });
}
