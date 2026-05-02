// POST /api/analyze
// Accepts a pasted decklist and returns a full AnalysisResult.
//
// Pipeline: parseDecklist -> Scryfall enriched lookup -> validateDecklist
// -> per-card classification -> derive analytics -> archetype guess.
//
// The Scryfall lookup is the live API (cached). Production deployments
// should switch to the Prisma-backed lookup once `npm run scryfall:sync`
// has populated the Card table.

import { NextResponse } from "next/server";
import { z } from "zod";

import { classify, loadClassifierOverrides } from "@/lib/classifier";
import { CARD_CATEGORIES } from "@/lib/db/card";
import { parseDecklist, validateDecklist } from "@/lib/decklist";
import { buildGamePlan, derive, guessArchetype } from "@/lib/analytics";
import type { AnalysisResult } from "@/lib/analytics";
import {
  lookupEnrichedCardsViaScryfall,
  type EnrichedLookupRow,
} from "@/lib/scryfall/api";
import { findCombos, type DetectedCombo } from "@/lib/spellbook";
import { fetchEdhrecCommander, type EdhrecData } from "@/lib/edhrec";
import { buildRecommendations } from "@/lib/recommend";
import { estimateBracket } from "@/lib/bracket/estimate";

export const runtime = "nodejs";

const RequestSchema = z.object({
  text: z.string().min(1).max(50_000),
});

function buildDeriveCards(
  validated: ReadonlyArray<{
    name: string;
    oracleId: string;
    quantity: number;
    isCommander: boolean;
  }>,
  enriched: ReadonlyMap<string, EnrichedLookupRow>,
  overrides: Awaited<ReturnType<typeof loadClassifierOverrides>>,
): Array<{
  name: string;
  oracleId: string;
  quantity: number;
  isCommander: boolean;
  cmc: number;
  typeLine: string;
  manaCost: string | null;
  categories: ReturnType<typeof classify>;
}> {
  const out: ReturnType<typeof buildDeriveCards> = [];
  for (const c of validated) {
    const meta = enriched.get(c.name);
    if (!meta) continue; // shouldn't happen — validator guarantees this
    const cats = classify(
      {
        name: meta.name,
        typeLine: meta.typeLine,
        oracleText: meta.oracleText,
      },
      { overrides },
    );
    out.push({
      name: c.name,
      oracleId: c.oracleId,
      quantity: c.quantity,
      isCommander: c.isCommander,
      cmc: meta.cmc,
      typeLine: meta.typeLine,
      manaCost: meta.manaCost,
      categories: cats,
    });
  }
  return out;
}

interface ErrorBody {
  ok: false;
  errors: unknown[];
  warnings?: unknown[];
}

interface SuccessBody {
  ok: true;
  analysis: AnalysisResult;
  warnings: unknown[];
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorBody>(
      {
        ok: false,
        errors: [{ error: "parse_error", message: "request body is not valid JSON" }],
      },
      { status: 400 },
    );
  }

  const parsedBody = RequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json<ErrorBody>(
      {
        ok: false,
        errors: [
          {
            error: "parse_error",
            message: "expected { text: string }",
            issues: parsedBody.error.issues,
          },
        ],
      },
      { status: 400 },
    );
  }

  const parsed = parseDecklist(parsedBody.data.text);
  if (parsed.lines.length === 0) {
    return NextResponse.json<ErrorBody>(
      {
        ok: false,
        errors: [{ error: "wrong_total", expected: 100, actual: 0 }],
        warnings: parsed.warnings,
      },
      { status: 400 },
    );
  }

  const uniqueNames = Array.from(new Set(parsed.lines.map((l) => l.name)));
  const enriched = await lookupEnrichedCardsViaScryfall(uniqueNames);

  // Validator gets a thin wrapper that strips down to CardLookupRow.
  const validation = await validateDecklist(parsed, {
    lookupCards: async () => ({
      found: new Map(enriched.found),
      missing: enriched.missing,
    }),
  });

  if (!validation.ok) {
    return NextResponse.json<ErrorBody>(
      {
        ok: false,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      { status: 422 },
    );
  }

  const overrides = await loadClassifierOverrides();
  const deriveCards = buildDeriveCards(
    validation.deck.cards,
    enriched.found,
    overrides,
  );

  // Type-assertion guard: classify() returns CardCategory[], which is
  // exactly what derive's `categories` expects.
  void CARD_CATEGORIES;

  const baseAnalysis = derive({
    commander: validation.deck.commander,
    commanders: validation.deck.commanders,
    colorIdentity: validation.deck.colorIdentity,
    cards: deriveCards,
  });

  // Find the commander entry so the archetype heuristic can read its
  // type line and oracle text.
  const cmdrName = validation.deck.commanders[0] ?? "";
  const cmdrMeta = enriched.found.get(cmdrName);
  const archetype = guessArchetype({
    commanderName: cmdrName,
    commanderTypeLine: cmdrMeta?.typeLine,
    commanderOracleText: cmdrMeta?.oracleText,
    averageCmc: baseAnalysis.averageCmc,
    totalCards: baseAnalysis.totalCards,
    categoryCounts: baseAnalysis.categoryCounts,
  });

  // Spellbook combo detection + EDHrec inclusion data. Both run in
  // parallel — the analytics pipeline doesn't need to chain through
  // them. If either fails we degrade: combos -> []; edhrec -> null.
  const mainCardNames = validation.deck.cards
    .filter((c) => !c.isCommander)
    .map((c) => c.name);

  let combos: DetectedCombo[] = [];
  let comboLookupFailed = false;
  let edhrec: EdhrecData | null = null;

  const [combosResult, edhrecResult] = await Promise.allSettled([
    findCombos({
      cardNames: mainCardNames,
      commanderNames: validation.deck.commanders,
    }),
    fetchEdhrecCommander(validation.deck.commander),
  ]);
  if (combosResult.status === "fulfilled") {
    combos = combosResult.value;
  } else {
    comboLookupFailed = true;
    // eslint-disable-next-line no-console
    console.warn("[analyze] spellbook lookup failed:", combosResult.reason);
  }
  if (edhrecResult.status === "fulfilled") {
    edhrec = edhrecResult.value;
  } else {
    // eslint-disable-next-line no-console
    console.warn("[analyze] edhrec fetch failed:", edhrecResult.reason);
  }

  const gamePlan = buildGamePlan({
    commander: validation.deck.commander,
    archetype,
    categoryCounts: baseAnalysis.categoryCounts,
    combos,
    averageCmc: baseAnalysis.averageCmc,
    landCount: baseAnalysis.landCount,
    totalCards: baseAnalysis.totalCards,
  });

  const recommendations = buildRecommendations({
    deck: validation.deck,
    edhrec,
    combos,
  });

  const bracketEstimate = await estimateBracket({
    cards: validation.deck.cards.map((c) => {
      const meta = enriched.found.get(c.name);
      return {
        name: c.name,
        typeLine: meta?.typeLine ?? "",
        oracleText: meta?.oracleText ?? "",
      };
    }),
    combos,
  });

  const analysis: AnalysisResult = {
    ...baseAnalysis,
    archetype,
    gamePlan,
    combos,
    comboLookupFailed,
    edhrec,
    recommendations,
    bracketEstimate,
  };
  return NextResponse.json<SuccessBody>({
    ok: true,
    analysis,
    warnings: validation.warnings,
  });
}
