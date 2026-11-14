"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Any escrow's page, by account. */
export function EscrowLookup() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <form
      className="flex max-w-xl flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) router.push(`/escrow/${id.trim().toLowerCase()}`);
      }}
    >
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        spellCheck={false}
        aria-label="Escrow account"
        placeholder="your-game.encroe.testnet"
        className="min-w-0 flex-1 rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-acid"
      />
      <button className="rounded-md bg-acid px-5 py-2.5 font-display text-xs font-bold tracking-wide text-void uppercase">
        Open it
      </button>
    </form>
  );
}
