// /library — server component listing the current session's saved decks.

import Link from "next/link";

import { prisma } from "@/lib/db/client";
import { getOrCreateSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LibraryPage(): Promise<JSX.Element> {
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
      updatedAt: true,
      _count: { select: { cards: true } },
    },
  });

  return (
    <main className="min-h-screen px-6 py-12 sm:px-12 sm:py-16 max-w-5xl mx-auto">
      <header className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
            Library
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Saved decks
          </h1>
        </div>
        <nav className="text-sm space-x-4">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            Analyze
          </Link>
          <Link href="/compare" className="text-zinc-400 hover:text-zinc-200">
            Compare
          </Link>
        </nav>
      </header>

      {decks.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-8 text-center">
          <p className="text-sm text-zinc-400">
            No saved decks yet.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm text-zinc-200 underline underline-offset-4 hover:text-white"
          >
            Analyze a deck →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {decks.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 hover:border-zinc-700"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <Link
                    href={`/library/${d.id}`}
                    className="text-base font-medium text-zinc-100 hover:underline"
                  >
                    {d.name}
                  </Link>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {d.commander}
                    {"  ·  "}
                    <span className="font-mono">{d.colorIdentity || "—"}</span>
                    {d.archetype && <>{"  ·  "}{d.archetype}</>}
                  </p>
                </div>
                <p className="text-xs text-zinc-600 whitespace-nowrap">
                  {d._count.cards} cards
                  {"  ·  "}
                  {new Date(d.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
