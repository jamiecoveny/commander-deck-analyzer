// /api/decks/[id] — GET a single saved deck + its most recent Analysis,
// or DELETE to remove it. Only the owning session can see / delete.

import { NextResponse } from "next/server";

import type { AnalysisResult } from "@/lib/analytics";
import { prisma } from "@/lib/db/client";
import { getOrCreateSessionUser } from "@/lib/session";

export const runtime = "nodejs";

interface SavedAnalysisBlob {
  decklistText?: string;
  recommendations?: unknown;
  full: AnalysisResult;
}

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: RouteCtx): Promise<Response> {
  const { id } = await ctx.params;
  const { userId } = await getOrCreateSessionUser();

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!deck) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const latest = deck.analyses[0];
  let analysis: AnalysisResult | null = null;
  let decklistText: string | null = null;
  if (latest) {
    try {
      const raw = JSON.parse(latest.recommendations as string) as SavedAnalysisBlob;
      analysis = raw.full;
      decklistText = raw.decklistText ?? null;
    } catch {
      // Stale row format — show the deck without analytics.
    }
  }
  return NextResponse.json({
    ok: true,
    deck: {
      id: deck.id,
      name: deck.name,
      commander: deck.commander,
      colorIdentity: deck.colorIdentity,
      archetype: deck.archetype,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    },
    decklistText,
    analysis,
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteCtx,
): Promise<Response> {
  const { id } = await ctx.params;
  const { userId } = await getOrCreateSessionUser();
  // Scope to session — never allow cross-session deletes.
  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!deck) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  await prisma.deck.delete({ where: { id: deck.id } });
  return NextResponse.json({ ok: true });
}
