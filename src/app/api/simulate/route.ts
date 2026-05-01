// POST /api/simulate
// Runs the heuristic playtest against the brief's Bracket-3 opponent
// template (×3) and returns per-game logs + an aggregate report.

import { NextResponse } from "next/server";
import { z } from "zod";

import { classify, loadClassifierOverrides } from "@/lib/classifier";
import { parseDecklist, validateDecklist } from "@/lib/decklist";
import {
  lookupEnrichedCardsViaScryfall,
  type EnrichedLookupRow,
} from "@/lib/scryfall/api";
import {
  bracket3Midrange,
  buildProfile,
  expandProfiles,
  simulate,
  type CardProfile,
  type SimulateResponse,
} from "@/lib/sim";

export const runtime = "nodejs";

const RequestSchema = z.object({
  text: z.string().min(1).max(50_000),
  games: z.number().int().min(1).max(20).optional().default(5),
  seed: z.number().int().optional(),
});

interface ErrorBody {
  ok: false;
  errors: unknown[];
}

interface SuccessBody {
  ok: true;
  result: SimulateResponse;
}

function buildDeckProfiles(
  validatedCards: ReadonlyArray<{
    name: string;
    oracleId: string;
    quantity: number;
    isCommander: boolean;
  }>,
  enriched: ReadonlyMap<string, EnrichedLookupRow>,
  overrides: Awaited<ReturnType<typeof loadClassifierOverrides>>,
): CardProfile[] {
  const specs: Array<{ profile: CardProfile; quantity: number }> = [];
  for (const c of validatedCards) {
    const meta = enriched.get(c.name);
    if (!meta) continue;
    const cats = classify(
      { name: meta.name, typeLine: meta.typeLine, oracleText: meta.oracleText },
      { overrides },
    );
    const profile = buildProfile({
      oracleId: c.oracleId,
      name: meta.name,
      cmc: meta.cmc,
      manaCost: meta.manaCost,
      typeLine: meta.typeLine,
      oracleText: meta.oracleText,
      power: meta.power,
      toughness: meta.toughness,
      categories: cats,
      isCommander: c.isCommander,
    });
    specs.push({ profile, quantity: c.quantity });
  }
  return expandProfiles(specs);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorBody>(
      { ok: false, errors: [{ error: "parse_error", message: "invalid JSON" }] },
      { status: 400 },
    );
  }
  const parsedBody = RequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json<ErrorBody>(
      {
        ok: false,
        errors: [{ error: "parse_error", issues: parsedBody.error.issues }],
      },
      { status: 400 },
    );
  }

  const parsed = parseDecklist(parsedBody.data.text);
  if (parsed.lines.length === 0) {
    return NextResponse.json<ErrorBody>(
      { ok: false, errors: [{ error: "wrong_total", expected: 100, actual: 0 }] },
      { status: 400 },
    );
  }

  const uniqueNames = Array.from(new Set(parsed.lines.map((l) => l.name)));
  const enriched = await lookupEnrichedCardsViaScryfall(uniqueNames);

  const validation = await validateDecklist(parsed, {
    lookupCards: async () => ({
      found: new Map(enriched.found),
      missing: enriched.missing,
    }),
  });
  if (!validation.ok) {
    return NextResponse.json<ErrorBody>(
      { ok: false, errors: validation.errors },
      { status: 422 },
    );
  }

  const overrides = await loadClassifierOverrides();
  const userDeck = buildDeckProfiles(
    validation.deck.cards,
    enriched.found,
    overrides,
  );

  const opponents = [
    bracket3Midrange(),
    bracket3Midrange(),
    bracket3Midrange(),
  ];
  // Distinct names so the aggregate report can split wins by opponent slot.
  for (let i = 0; i < opponents.length; i += 1) {
    opponents[i] = { ...opponents[i]!, name: `Bracket-3 Midrange #${i + 1}` };
  }

  const result = simulate({
    userDeck,
    opponents,
    games: parsedBody.data.games,
    seed: parsedBody.data.seed,
  });

  return NextResponse.json<SuccessBody>({ ok: true, result });
}
