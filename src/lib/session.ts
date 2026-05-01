// Anonymous session identity.
//
// We deliberately did NOT wire up NextAuth + email magic links for
// Phase 1 — the brief flagged that as "Optional for MVP". Instead, a
// cookie-based session id pins each visitor to a stable User row in
// the DB so they can save and revisit decks. If a user clears cookies
// the binding is lost — that's a documented limitation, not a bug.
//
// When real auth lands later, the migration is straightforward: keep
// the User table, add an `email` field, and let an authed user inherit
// any decks owned by their old session id.

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db/client";

const COOKIE_NAME = "cda_session_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Read or create a session-bound User row. The route handlers (server
 * components and API routes alike) call this once per request.
 *
 * If the cookie is present but the userId in it doesn't match a real
 * row (e.g., DB was reset), we mint a new User and overwrite the
 * cookie. That keeps callers from having to handle the "stale cookie"
 * edge case.
 */
export async function getOrCreateSessionUser(): Promise<{ userId: string }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;

  if (existing) {
    const found = await prisma.user.findUnique({ where: { id: existing } });
    if (found) return { userId: found.id };
  }

  const created = await prisma.user.create({
    data: { id: existing ?? randomUUID() },
  });

  // Cookie API in Next 14 server components is read-only outside route
  // handlers / server actions. We try to set; if it fails (read-only
  // context like a server component), the next API call will set it
  // when the user does something stateful.
  try {
    jar.set(COOKIE_NAME, created.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
    });
  } catch {
    // Read-only context (e.g., a server component rendering). Fine —
    // the next request will hit a route handler and write it then.
  }

  return { userId: created.id };
}
