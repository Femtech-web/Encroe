"use client";

import { hexToBytes } from "@noble/hashes/utils.js";
import { useEffect, useState } from "react";
import { loadKey, saveKey } from "@/lib/game/client";
import { Core } from "@/lib/game/core";
import { newSecretKey, publicKeyOf } from "@/lib/game/moves";
import type { Catalog, CoreMove } from "@/lib/cores/catalog";
import type { PackagePlayer } from "@/lib/encroe/release";

const CODES: Record<number, string> = {
  1: "not enough for that",
  2: "no such player",
  3: "no room for another kind of item",
  4: "one action per tick: wait a moment",
  5: "no such thing",
};
const TICK_MS = 2000;

/**
 * Any revived game, played in this browser: the core that came out of the escrow holds the world, and each button
 * calls one of the game's own exports. Your browser's key is your seat; a key already in the world gets its own
 * items back.
 */
export function CorePlay({
  module,
  players,
  catalog,
  escrow,
}: {
  module: WebAssembly.Module;
  players: PackagePlayer[];
  catalog: Catalog & { moves: CoreMove[] };
  escrow: string;
}) {
  const [core, setCore] = useState<Core | null>(null);
  const [me, setMe] = useState(-1);
  const [returning, setReturning] = useState(false);
  const [version, setVersion] = useState(0);
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});

  useEffect(() => {
    let live = true;
    Core.create(module).then((c) => {
      c.load(players.map((p) => ({ pk: hexToBytes(p.pk), items: p.items })));
      const sk = loadKey() ?? newSecretKey();
      saveKey(sk);
      const pk = publicKeyOf(sk);
      if (!live) return;
      setReturning(players.some((p) => p.pk === pk));
      setMe(c.join(hexToBytes(pk)));
      setCore(c);
    });
    return () => {
      live = false;
    };
  }, [module, players]);

  if (!core) return <div className="min-h-[60vh]" />;
  const mine = me >= 0 ? core.items(me) : [];
  const name = (id: number) => catalog.items[id] ?? `item ${id}`;

  function play(m: CoreMove) {
    const args = m.args.map((a, i) => {
      if (a.kind === "tick") return Math.floor(Date.now() / TICK_MS);
      const pick = picks[`${m.name}:${i}`];
      if (a.kind === "choice") return pick ?? a.options[0][0];
      return pick ?? mine.find(([id]) => id >= a.from)?.[0] ?? 0;
    });
    const code = core!.call(m.name, me, ...args);
    setSaid(
      code === 0
        ? { text: m.says ? m.says.read(core!.out(m.says.words)) : `${m.label}: done`, ok: true }
        : { text: CODES[code] ?? `the core said ${code}`, ok: false },
    );
    setVersion((v) => v + 1);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-12" data-version={version}>
      <p className="rounded-md border border-acid/40 bg-acid-soft px-4 py-3 text-sm text-acid">
        {catalog.game}, revived from <span className="font-mono">{escrow}</span>: its {catalog.language} server core
        runs in your browser. No studio server is involved.
      </p>
      <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">
            {catalog.language} · {catalog.genre}
          </p>
          <h1 className="mt-2 font-display text-h1 font-black">{catalog.game}</h1>
          <p className="mt-2 text-sm text-ink-3">
            {returning
              ? "Your key was in this world: these are your own items."
              : "You joined the revived world as a new player."}
          </p>
        </div>
        <span className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-ink-2">
          {core.count()} players
        </span>
      </header>

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 min-h-6 text-sm ${said?.ok === false ? "text-flare" : "text-acid"}`}
      >
        {said?.text}
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="yours" className="rounded-lg border border-line-strong bg-panel-2 p-5">
          <h2 id="yours" className="font-display text-lg font-bold">
            Yours
          </h2>
          <ul className="mt-4 space-y-1.5">
            {mine.map(([id, q]) => (
              <li key={id} className="flex justify-between rounded-sm bg-night px-3 py-2 font-mono text-sm">
                <span>{name(id)}</span>
                <span className="font-bold text-gold">{q}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="moves" className="space-y-3">
          <h2 id="moves" className="font-display text-lg font-bold">
            Moves
          </h2>
          {catalog.moves.map((m) => (
            <div key={m.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-4">
              <span className="min-w-36 flex-1 font-display text-sm font-bold">{m.label}</span>
              {m.args.map((a, i) => {
                if (a.kind === "tick") return null;
                const options =
                  a.kind === "choice"
                    ? a.options
                    : mine.filter(([id]) => id >= a.from).map(([id]) => [id, name(id)] as [number, string]);
                return (
                  <select
                    key={i}
                    aria-label={`${m.label}: choice`}
                    value={picks[`${m.name}:${i}`] ?? options[0]?.[0] ?? ""}
                    onChange={(e) => setPicks({ ...picks, [`${m.name}:${i}`]: Number(e.target.value) })}
                    className="rounded-sm border border-line bg-night px-2 py-1.5 text-sm"
                  >
                    {options.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                );
              })}
              <button
                onClick={() => play(m)}
                disabled={me < 0}
                aria-label={m.label}
                className="rounded-md bg-gold px-4 py-2 font-display text-xs font-bold tracking-wide text-void uppercase disabled:opacity-40"
              >
                Go
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
