// Line-level decklist parser. Pure text-in / structure-out — no DB or
// validation here, that's validate.ts's job.
//
// Supported line shapes (all whitespace-trimmed, case-tolerant on markers):
//
//   Sol Ring
//   1 Sol Ring
//   1x Sol Ring
//   1 Sol Ring (CMR) 263
//   1 Sol Ring [CMR]
//   1 Sol Ring (CMR) 263 *F*
//   1 *CMDR* Atraxa, Praetors' Voice
//   *CMDR* Atraxa, Praetors' Voice
//
// Block markers:
//
//   // Commander       — every following non-blank line is a commander
//                        until a blank line, another `//` block marker,
//                        or end of input.
//   *CMDR* on a line   — that single line is a commander.
//   // Sideboard       — everything until end of input is ignored.
//   SB:                — same as above (Magic Workstation style).
//
// Comment lines starting with `//` (other than recognized markers) or `#`
// are ignored. Empty lines reset the `// Commander` block.

import type { ParsedDecklist, ParsedLine, ParseWarning } from "./types";

const COMMANDER_MARKER = /\*CMDR\*/i;
const FOIL_MARKER = /\*F\*/gi;

const SIDEBOARD_MARKER = /^(SB:|\/\/\s*Sideboard|Sideboard)\s*:?\s*$/i;
const COMMANDER_BLOCK = /^(\/\/\s*Commander|#\s*Commander)\s*$/i;
const MAYBEBOARD_BLOCK = /^(\/\/\s*Maybeboard|Maybeboard)\s*$/i;
const MAINBOARD_BLOCK = /^(\/\/\s*Mainboard|Mainboard|Deck)\s*$/i;

const COMMENT_LINE = /^(\/\/|#)/;

interface RawParse {
  quantity: number;
  name: string;
  isCommander: boolean;
}

/**
 * Strip set codes and collector numbers from the right side of a line.
 *
 * Common deck-export formats append `(SET) 123` or `[SET]` after the card
 * name. We strip from right to left, repeating until nothing matches, so
 * any combination of order works.
 */
function stripTrailingMetadata(input: string): string {
  let s = input;
  // Run multiple passes so combinations like "Foo (CMR) 263" peel cleanly.
  for (let i = 0; i < 4; i += 1) {
    const before = s;
    // Trailing collector number (digits, optional letter suffix like 123a).
    s = s.replace(/\s+\d+[a-z]?\s*$/i, "");
    // Trailing set code in parens or brackets.
    s = s.replace(/\s+[(\[][A-Za-z0-9]{2,6}[)\]]\s*$/, "");
    if (s === before) break;
  }
  return s.trim();
}

function parseCardLine(raw: string): RawParse | { error: string } | null {
  let working = raw.trim();
  if (working === "") return null;

  let isCommander = false;
  if (COMMANDER_MARKER.test(working)) {
    isCommander = true;
    working = working.replace(COMMANDER_MARKER, "").replace(/\s{2,}/g, " ").trim();
  }
  // Foil indicators are noise to us.
  working = working.replace(FOIL_MARKER, "").replace(/\s{2,}/g, " ").trim();

  // Quantity prefix: "1 ", "1x ", "12x ", etc.
  let quantity = 1;
  const qtyMatch = /^(\d+)x?\s+(.+)$/i.exec(working);
  if (qtyMatch) {
    const parsed = Number.parseInt(qtyMatch[1] ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "invalid quantity" };
    }
    quantity = parsed;
    working = (qtyMatch[2] ?? "").trim();
  }

  const stripped = stripTrailingMetadata(working);
  if (stripped === "") {
    return { error: "card name missing after stripping metadata" };
  }

  return { quantity, name: stripped, isCommander };
}

/**
 * Parse a multi-line decklist string into structured lines. No card lookup
 * happens here — this is pure text parsing. The validator handles DB
 * lookups, color identity, and banned-list checks.
 */
export function parseDecklist(input: string): ParsedDecklist {
  const lines = input.split(/\r?\n/);
  const result: ParsedLine[] = [];
  const warnings: ParseWarning[] = [];

  let inCommanderBlock = false;
  let inSideboard = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (trimmed === "") {
      // Blank line ends an open `// Commander` block.
      inCommanderBlock = false;
      continue;
    }

    if (SIDEBOARD_MARKER.test(trimmed) || MAYBEBOARD_BLOCK.test(trimmed)) {
      inSideboard = true;
      inCommanderBlock = false;
      continue;
    }
    if (inSideboard) continue;

    if (COMMANDER_BLOCK.test(trimmed)) {
      inCommanderBlock = true;
      continue;
    }

    if (MAINBOARD_BLOCK.test(trimmed)) {
      inCommanderBlock = false;
      continue;
    }

    // Generic comment lines starting with // or # that aren't a known block.
    if (COMMENT_LINE.test(trimmed)) {
      continue;
    }

    const parsed = parseCardLine(trimmed);
    if (parsed === null) continue;
    if ("error" in parsed) {
      warnings.push({ lineNumber, message: parsed.error });
      continue;
    }

    result.push({
      lineNumber,
      raw,
      name: parsed.name,
      quantity: parsed.quantity,
      isCommander: parsed.isCommander || inCommanderBlock,
    });
  }

  return { lines: result, warnings };
}
