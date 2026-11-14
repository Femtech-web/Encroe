"use client";

import { useCallback, useEffect, useState } from "react";
import { SealCheck } from "@/components/game/SealCheck";
import type { Catalog, CoreMove } from "@/lib/cores/catalog";
import { NAME } from "@/lib/game/moves";
import type { GameId } from "@/lib/game/games";
import type { Items } from "@/lib/game/items";
import type { Driver, Standing } from "@/lib/play/drivers";

/**
 * Any game, from its catalog: the player's items, the game's own moves with their choices, the board and what is
 * happening. The same screen runs a live world on the studio's server and a revived world in this browser.
 */
export function CoreGame({
  game,
  catalog,
  driver,
  banner,
  sk,
  live,
}: {
  game?: GameId;
  catalog: Catalog & { moves: CoreMove[] };
  driver: Driver;
  banner: React.ReactNode;
  sk: Uint8Array;
  /** A live world can be checked against its escrow; a revived one already came out of it. */
  live: boolean;
}) {
  const [me, setMe] = useState<{ name: string; items: Items } | null | undefined>(undefined);
  const [world, setWorld] = useState<{ players: number; board: Standing[]; events: string[] } | null>(null);
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const refresh = useCallback(async () => {
    const [m, w] = await Promise.all([driver.me(), driver.world()]);
    setMe(m);
    setWorld(w);
  }, [driver]);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && refresh().catch(() => undefined);
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refresh]);

  const label = (id: number) => catalog.items[id] ?? `item ${id}`;
  const items = me?.items ?? [];

  async function play(m: CoreMove) {
    setBusy(true);
    const args = m.args.flatMap((a, i) => {
      if (a.kind === "tick") return [];
      const pick = picks[`${m.name}:${i}`];
      if (a.kind === "choice") return [pick ?? a.options[0][0]];
      return [pick ?? items.find(([id]) => id >= a.from)?.[0] ?? 0];
    });
    setSaid(await driver.call(m, args));
    await refresh();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-10">
      <div className="rounded-md border border-acid/40 bg-acid-soft px-4 py-3 text-sm text-acid">{banner}</div>
      <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">
            {catalog.language} · {catalog.genre}
          </p>
          <h1 className="mt-2 font-display text-h1 font-black">{me ? me.name : catalog.game}</h1>
          {me && <p className="mt-1 text-sm text-ink-3">in {catalog.game}</p>}
        </div>
        {world && (
          <span className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-ink-2">
            {world.players}/64 players
          </span>
        )}
      </header>

      {me === null && (
        <form
          className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!NAME.test(name)) return;
            setBusy(true);
            try {
              await driver.join(name.trim());
              setSaid({ ok: true, text: `Welcome, ${name.trim()}.` });
            } catch (err) {
              setSaid({ ok: false, text: (err as Error).message });
            }
            await refresh();
            setBusy(false);
          }}
        >
          <label htmlFor="join-name" className="sr-only">
            Your name
          </label>
          <input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            placeholder="Your name"
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-night px-4 py-3 font-display outline-none focus:border-gold"
          />
          <button
            disabled={!NAME.test(name) || busy}
            className="rounded-md bg-gold px-6 py-3 font-display text-sm font-bold tracking-wide text-void uppercase disabled:opacity-40"
          >
            Join {catalog.game}
          </button>
        </form>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 min-h-6 text-sm ${said?.ok === false ? "text-flare" : "text-acid"}`}
      >
        {said?.text}
      </p>

      {me && (
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <div className="space-y-6">
            <section aria-labelledby="yours" className="rounded-lg border border-line-strong bg-panel-2 p-5">
              <h2 id="yours" className="font-display text-lg font-bold">
                Yours
              </h2>
              <ul className="mt-4 space-y-1.5">
                {items.map(([id, q]) => (
                  <li key={id} className="flex justify-between rounded-sm bg-night px-3 py-2 font-mono text-sm">
                    <span>{label(id)}</span>
                    <span className="font-bold text-gold">{q}</span>
                  </li>
                ))}
              </ul>
            </section>
            {live && game && <SealCheck sk={sk} game={game} />}
          </div>

          <section aria-labelledby="moves" className="space-y-3">
            <h2 id="moves" className="font-display text-lg font-bold">
              Moves
            </h2>
            {catalog.moves.map((m) => (
              <div
                key={m.name}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-4"
              >
                <span className="min-w-36 flex-1 font-display text-sm font-bold">{m.label}</span>
                {m.args.map((a, i) => {
                  if (a.kind === "tick") return null;
                  const options =
                    a.kind === "choice"
                      ? a.options
                      : items.filter(([id]) => id >= a.from).map(([id]) => [id, label(id)] as [number, string]);
                  return (
                    <select
                      key={i}
                      aria-label={`${m.label}: choice`}
                      value={picks[`${m.name}:${i}`] ?? options[0]?.[0] ?? ""}
                      onChange={(e) => setPicks({ ...picks, [`${m.name}:${i}`]: Number(e.target.value) })}
                      className="rounded-sm border border-line bg-night px-2 py-1.5 text-sm"
                    >
                      {options.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  );
                })}
                <button
                  onClick={() => play(m)}
                  disabled={busy}
                  aria-label={m.label}
                  className="rounded-md bg-gold px-4 py-2 font-display text-xs font-bold tracking-wide text-void uppercase disabled:opacity-40"
                >
                  Go
                </button>
              </div>
            ))}
          </section>
        </div>
      )}

      {world && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="board" className="rounded-lg border border-line bg-panel p-5">
            <h2 id="board" className="font-display text-lg font-bold">
              The board
            </h2>
            <ol className="mt-3 space-y-1">
              {world.board.map((b, i) => (
                <li key={b.pk} className="flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm odd:bg-night/60">
                  <span className="w-5 font-mono text-xs text-ink-3">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{b.name}</span>
                  <span className="text-xs text-ink-3">{b.title}</span>
                  <span className="w-14 text-right font-mono text-xs">{b.score}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="feed" className="rounded-lg border border-line bg-panel p-5">
            <h2 id="feed" className="font-display text-lg font-bold">
              What is happening
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
              {world.events.slice(0, 10).map((e, i) => (
                <li key={`${i}-${e}`} className="truncate">
                  {e}
                </li>
              ))}
              {!world.events.length && <li className="text-ink-3">Nothing yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
