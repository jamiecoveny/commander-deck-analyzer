// Convert a commander name to an EDHrec URL slug.
//
// Rules (verified by probing live URLs):
//   - Strip diacritics (NFD normalize, drop combining marks).
//   - Lowercase.
//   - Replace any non-[a-z0-9] character with a single dash.
//   - Collapse runs of dashes.
//   - Trim leading/trailing dashes.
//
// Examples:
//   "Atraxa, Praetors' Voice"  -> "atraxa-praetors-voice"
//   "Krenko, Mob Boss"         -> "krenko-mob-boss"
//   "Lim-Dûl's Vault"          -> "lim-dul-s-vault"
//   "Jhoira, Weatherlight Captain" -> "jhoira-weatherlight-captain"
//
// For partner/background pairings the brief's deck.commander field is
// "Front // Back" (alphabetically sorted). EDHrec uses a different
// convention for partners — there's no clean automatic mapping, so for
// pairs we slug only the first commander and document the limitation.

export function commanderSlug(name: string): string {
  if (!name) return "";
  // Take only the first commander if a pair was joined with " // ".
  const single = name.split(" // ")[0] ?? name;
  return single
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function edhrecCommanderUrl(name: string): string {
  return `https://json.edhrec.com/pages/commanders/${commanderSlug(name)}.json`;
}
