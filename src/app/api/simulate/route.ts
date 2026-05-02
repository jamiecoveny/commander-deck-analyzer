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
  bracket2Core,
  bracket3Midrange,
  bracket4Optimized,
  bracket5CEDH,
  buildProfile,
  expandProfiles,
  simulate,
  type CardProfile,
  type PlayerArchetype,
  type SimulateResponse,
} from "@/lib/sim";
import { estimateBracket } from "@/lib/bracket/estimate";

export const runtime = "nodejs";

const BracketSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const RequestSchema = z.object({
  text: z.string().min(1).max(50_000),
  games: z.number().int().min(1).max(20).optional().default(5),
  seed: z.number().int().optional(),
  /** Override the user's bracket. If omitted, we estimate it from the deck. */
  userBracket: BracketSchema.optional(),
  /** Brackets for the 3 opponents (default: [3, 3, 3]). */
  opponentBrackets: z.array(BracketSchema).length(3).optional(),
});

function makeOpponent(bracket: 1 | 2 | 3 | 4 | 5): PlayerArchetype {
  switch (bracket) {
    case 1:
    case 2:
      return bracket2Core();
    case 3:
      return bracket3Midrange();
    case 4:
      return bracket4Optimized();
    case 5:
      return bracket5CEDH();
  }
}

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

  // Bracket selection: user override > estimator. Same for opponents.
  let userBracket = parsedBody.data.userBracket;
  if (userBracket === undefined) {
    const est = await estimateBracket({
      cards: validation.deck.cards.map((c) => {
        const meta = enriched.found.get(c.name);
        return {
          name: c.name,
          typeLine: meta?.typeLine ?? "",
          oracleText: meta?.oracleText ?? "",
        };
      }),
      combos: [],
    });
    userBracket = est.bracket;
  }

  const oppBrackets = parsedBody.data.opponentBrackets ?? [3, 3, 3];
  const opponents: PlayerArchetype[] = oppBrackets.map((b, i) => {
    const tpl = makeOpponent(b);
    return { ...tpl, name: `${tpl.name} #${i + 1}` };
  });

  const result = simulate({
    userDeck,
    userBracket,
    opponents,
    games: parsedBody.data.games,
    seed: parsedBody.data.seed,
  });

  return NextResponse.json<SuccessBody>({ ok: true, result });
}
