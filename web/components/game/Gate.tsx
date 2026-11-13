"use client";

import { hexToBytes } from "@noble/hashes/utils.js";
import { useState } from "react";
import { NAME } from "@/lib/game/moves";

/** The way in: a name, and a key made in this browser. */
export function Gate({
  onEnter,
  onImport,
  busy,
  error,
  full,
}: {
  onEnter: (name: string) => void;
  /** A key from a backup file: the way back into a world, including one revived from its escrow. */
  onImport: (sk: Uint8Array) => void;
  busy: boolean;
  error: string | null;
  full: boolean;
}) {
  const [name, setName] = useState("");
  const [bad, setBad] = useState<string | null>(null);

  async function load(file: File) {
    try {
      const { secret_key } = JSON.parse(await file.text()) as { secret_key?: string };
      if (!secret_key || !/^[0-9a-f]{64}$/.test(secret_key)) throw new Error();
      setBad(null);
      onImport(hexToBytes(secret_key));
    } catch {
      setBad("That is not an Embergate key backup.");
    }
  }

  const valid = NAME.test(name);
  return (
    <section className="mx-auto grid max-w-page gap-10 px-5 py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:py-24">
      <div className="animate-rise">
        <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase">A world sealed into NEAR</p>
        <h1 className="mt-5 font-display text-hero font-black tracking-tight">
          Embergate<span className="text-ember">.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-2">
          Gather from six nodes, forge relics, trade with other players, chase the Phoenix. Every rule runs in one
          sealed server core, and its escrow on NEAR means that if we ever go dark,{" "}
          <strong className="text-ink">this world, and everything you made in it, goes to you</strong>.
        </p>
      </div>

      <form
        className="animate-rise rounded-xl border border-line-strong bg-panel/80 p-7 shadow-deep backdrop-blur [animation-delay:120ms]"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onEnter(name.trim());
        }}
      >
        <label htmlFor="name" className="font-display text-h2 font-bold">
          Who enters?
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoComplete="off"
          placeholder="Your name"
          className="mt-5 w-full rounded-md border border-line-strong bg-night px-4 py-3.5 font-display text-lg outline-none placeholder:text-ink-3 focus:border-ember"
        />
        <p className="mt-2 text-sm text-ink-3">2 to 16 letters or digits.</p>
        <button
          type="submit"
          disabled={!valid || busy || full}
          className="mt-6 w-full rounded-md bg-ember px-5 py-4 font-display font-bold tracking-wide text-void uppercase transition hover:shadow-ember disabled:cursor-not-allowed disabled:opacity-40"
        >
          {full ? "The world is full" : busy ? "Opening the gate…" : "Enter Embergate"}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-flare">
            {error}
          </p>
        )}
        <label className="mt-4 block cursor-pointer text-center text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-acid">
          I have a key backup
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
          />
        </label>
        {bad && <p className="mt-2 text-center text-sm text-flare">{bad}</p>}
        <p className="mt-6 border-t border-line pt-5 text-sm text-ink-3">
          Your browser makes a key that never leaves it. Each move you make is signed with it, and the sealed world
          records your items under that key, not under an account on our server.
        </p>
      </form>
    </section>
  );
}
