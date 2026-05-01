"use client";

import { useRouter } from "next/navigation";

interface DeckOption {
  id: string;
  name: string;
  commander: string;
}

export default function CompareControls({
  decks,
  selectedA,
  selectedB,
}: {
  decks: DeckOption[];
  selectedA: string;
  selectedB: string;
}): JSX.Element {
  const router = useRouter();
  function update(field: "a" | "b", value: string): void {
    const next = new URLSearchParams();
    if (field === "a") {
      if (value) next.set("a", value);
      if (selectedB) next.set("b", selectedB);
    } else {
      if (selectedA) next.set("a", selectedA);
      if (value) next.set("b", value);
    }
    router.push(`/compare?${next.toString()}`);
  }

  if (decks.length < 2) {
    return (
      <p className="text-sm text-zinc-500">
        You need at least two saved decks to compare. Save decks from the
        analyze page.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <DeckSelect
        label="Deck A"
        decks={decks}
        value={selectedA}
        onChange={(v) => update("a", v)}
      />
      <DeckSelect
        label="Deck B"
        decks={decks}
        value={selectedB}
        onChange={(v) => update("b", v)}
      />
    </div>
  );
}

function DeckSelect({
  label,
  decks,
  value,
  onChange,
}: {
  label: string;
  decks: DeckOption[];
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-zinc-500 block mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
      >
        <option value="">— pick a deck —</option>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.commander})
          </option>
        ))}
      </select>
    </label>
  );
}
