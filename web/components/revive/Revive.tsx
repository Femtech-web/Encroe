"use client";

import { useCallback, useMemo, useState } from "react";
import { Game } from "@/components/game/Game";
import { Glyph } from "@/components/game/Glyph";
import { loadKey, loadName } from "@/lib/game/client";
import { CATALOGS } from "@/lib/cores/catalog";
import { publicKeyOf } from "@/lib/game/moves";
import { local } from "@/lib/game/transport";
import type { World } from "@/lib/game/world";
import POOL from "@/lib/encroe/pool.json";
import { sha256Hex } from "@/lib/encroe/release";
import { LIVE, NotReleased, revive, type Revived, type Step } from "@/lib/encroe/revive";
import { RevivedPlay } from "@/components/play/RevivedPlay";
import { Handover } from "@/components/items/Handover";
import { claimable } from "@/lib/encroe/items";
import { ReleasePanel } from "./ReleasePanel";

const STEPS: { id: string; label: string }[] = [
  { id: "chain", label: "Read the escrow from NEAR" },
  { id: "identity", label: "The key belongs to this contract" },
  { id: "release", label: "NEAR's MPC network signed the release" },
  { id: "package", label: "The sealed package is the one committed" },
  { id: "open", label: "Decrypt it with the released key" },
  { id: "core", label: "The server core is the build the enclave verified" },
  { id: "players", label: "Every player's items match NEAR's root" },
  { id: "boot", label: "The server boots in this browser" },
];

const PRESETS = [
  { escrow: "encroe-embergate.testnet", note: "this site's world: alive, so it holds" },
  // Short-grace escrows the studio stopped heartbeating, for anyone to release (scripts/studio/bot.sh pool).
  ...POOL.toReversed().map((escrow) => ({ escrow, note: "a silent studio" })),
  { escrow: "encroe-life-52e4.testnet", note: "the first release" },
];

const PLAYABLE = ["join", "gather", "craft", "restore_tick"];

/** `tamper` flips one byte of the package it downloads: the attack page's way to show the check refusing it. */
export function Revive({ initial, tamper = false }: { initial?: string; tamper?: boolean }) {
  const [escrow, setEscrow] = useState(initial ?? PRESETS[0].escrow);
  const [steps, setSteps] = useState<Record<string, Step>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<NotReleased | null>(null);
  const [revived, setRevived] = useState<Revived | null>(null);
  const [playing, setPlaying] = useState(false);
  const mine = useMemo(() => {
    const sk = loadKey();
    return sk ? publicKeyOf(sk) : null;
  }, []);

  const run = useCallback(
    async (target: string) => {
      setEscrow(target);
      setSteps({});
      setError(null);
      setHeld(null);
      setRevived(null);
      setPlaying(false);
      setRunning(true);
      try {
        const from = tamper
          ? {
              ...LIVE,
              sealed: async (url: string) => {
                const bytes = await LIVE.sealed(url);
                bytes[Math.floor(bytes.length / 2)] ^= 1;
                return bytes;
              },
            }
          : LIVE;
        const r = await revive(target.trim(), (s) => setSteps((prev) => ({ ...prev, [s.id]: s })), from);
        setRevived(r);
      } catch (e) {
        if (e instanceof NotReleased) setHeld(e);
        else setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [tamper],
  );
  const released = useCallback(() => run(escrow), [run, escrow]);

  const transport = useMemo(() => {
    if (!revived) return null;
    const c = revived.state.commitment!;
    const myName = loadName();
    const world: World = {
      v: 1,
      events: [],
      players: revived.pkg.players.map((p) => ({
        pk: p.pk,
        name: p.pk === mine && myName ? myName : p.pk.slice(0, 8),
        items: p.items,
        nonce: 0,
        tick: 0,
        since: 0,
      })),
    };
    return local(revived.escrow, c.epoch, world, revived.module, c.core_sha256);
  }, [revived, mine]);

  const playable =
    revived && PLAYABLE.every((f) => WebAssembly.Module.exports(revived.module).some((e) => e.name === f));
  const catalog = revived ? CATALOGS[revived.state.commitment!.core_sha256] : undefined;
  const moves = catalog?.moves;

  if (playing && transport && playable) return <Game transport={transport} />;
  if (playing && revived && catalog && moves)
    return (
      <RevivedPlay
        module={revived.module}
        players={revived.pkg.players}
        catalog={{ ...catalog, moves }}
        escrow={revived.escrow}
      />
    );

  return (
    <div className="mx-auto max-w-page px-5 py-14 lg:py-20">
      <p className="font-mono text-xs tracking-[0.3em] text-flare uppercase">After the studio</p>
      {tamper && (
        <p className="mt-4 rounded-md border border-flare/50 bg-flare-soft px-4 py-3 text-sm text-flare">
          Tamper mode: this page flips one byte of the package it downloads, as a malicious host would.
        </p>
      )}
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Bring the game <span className="text-acid">back.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        When a studio goes silent, its escrow releases the key. From then on you need nothing from anyone: this page
        reads the escrow from NEAR, takes the sealed package from FastFS, checks every hash, and boots the server in
        your browser.
      </p>

      <form
        className="mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(escrow);
        }}
      >
        <label htmlFor="escrow" className="sr-only">
          Escrow account
        </label>
        <input
          id="escrow"
          value={escrow}
          onChange={(e) => setEscrow(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-night px-4 py-3.5 font-mono text-sm outline-none focus:border-acid"
        />
        <button
          disabled={running}
          className="rounded-md bg-acid px-6 py-3.5 font-display text-sm font-bold tracking-wide text-void uppercase transition hover:shadow-acid disabled:opacity-50"
        >
          {running ? "Bringing it back…" : "Bring it back"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.escrow}
            onClick={() => run(p.escrow)}
            disabled={running}
            className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-acid hover:text-acid"
          >
            {p.escrow} <span className="text-ink-3">· {p.note}</span>
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <ol className="space-y-2" aria-label="Checks">
          {STEPS.map((s, i) => {
            const done = steps[s.id];
            const active = running && !done && (i === 0 || steps[STEPS[i - 1].id]?.ok);
            return (
              <li
                key={s.id}
                className={`flex gap-3 rounded-md border px-4 py-3 transition ${
                  done?.ok
                    ? "animate-rise border-acid/30 bg-acid-soft"
                    : done
                      ? "border-flare/50 bg-flare-soft"
                      : "border-line bg-panel/60"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[11px] ${
                    done?.ok
                      ? "bg-acid text-void"
                      : done
                        ? "bg-flare text-void"
                        : "border border-line-strong text-ink-3"
                  } ${active ? "animate-pulse" : ""}`}
                >
                  {done?.ok ? "✓" : done ? "✗" : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${done ? "text-ink" : "text-ink-3"}`}>{s.label}</p>
                  {done?.detail && <p className="mt-0.5 truncate font-mono text-xs text-ink-3">{done.detail}</p>}
                </div>
              </li>
            );
          })}
          {held && (
            <li className="list-none">
              <ReleasePanel escrow={escrow.trim()} lapsesAt={held.lapsesAt} onReleased={released} />
            </li>
          )}
          {error && (
            <li role="alert" className="rounded-md border border-flare/50 px-4 py-3 text-sm text-flare">
              {error}
            </li>
          )}
        </ol>

        {revived && (
          <section
            aria-labelledby="back"
            className="animate-rise rounded-xl border border-acid/40 bg-panel p-6 shadow-acid"
          >
            <h2 id="back" className="font-display text-h1 font-black">
              It&rsquo;s back.
            </h2>
            {catalog && (
              <p className="mt-3 inline-flex flex-wrap gap-2 font-mono text-xs">
                <span className="rounded-sm bg-gold-soft px-2 py-1 text-gold">{catalog.game}</span>
                <span className="rounded-sm bg-acid-soft px-2 py-1 text-acid">{catalog.language} server core</span>
                <span className="rounded-sm border border-line px-2 py-1 text-ink-3">{catalog.genre}</span>
              </p>
            )}
            <p className="mt-3 text-ink-2">
              <span className="font-mono text-sm">{revived.pkg.game}</span>, epoch {revived.pkg.epoch}:{" "}
              {revived.pkg.players.length} players and every item they held, released by{" "}
              <span className="font-mono text-sm">{revived.state.released_by}</span>.
            </p>
            <ul className="mt-5 max-h-80 space-y-1.5 overflow-auto pr-1">
              {revived.pkg.players.map((p) => (
                <li
                  key={p.pk}
                  className={`flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm ${
                    p.pk === mine ? "bg-ember-soft ring-1 ring-ember/50" : "odd:bg-night/60"
                  }`}
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-ink-3">{p.pk.slice(0, 8)}</span>
                  {p.pk === mine && <span className="font-display text-xs font-bold text-ember">YOU</span>}
                  <span className="flex flex-wrap gap-1.5">
                    {p.items.map(([id, q]) => (
                      <span key={id} className="flex items-center gap-1 font-mono text-xs">
                        {playable && <Glyph id={id} size={13} />}
                        {q} {catalog?.items[id] ?? `item ${id}`}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              {(playable || moves) && (
                <button
                  onClick={() => setPlaying(true)}
                  className="rounded-md bg-ember px-5 py-3 font-display text-sm font-bold tracking-wide text-void uppercase hover:shadow-ember"
                >
                  Play on
                </button>
              )}
              <Download name={`${revived.pkg.game}-${revived.pkg.epoch}-core.wasm`} bytes={revived.core}>
                Server core ({sha256Hex(revived.core).slice(0, 8)})
              </Download>
              <Download
                name={`${revived.pkg.game}-${revived.pkg.epoch}-world.json`}
                bytes={new TextEncoder().encode(JSON.stringify(revived.pkg.players, null, 2))}
              >
                The world
              </Download>
            </div>
            {!playable && !moves && (
              <p className="mt-4 text-sm text-ink-3">
                This core is the go/no-go test core: it holds and trades items, but has no game moves to play.
              </p>
            )}
          </section>
        )}
        {revived && claimable(revived.escrow) && (
          <Handover
            escrow={revived.escrow}
            game={revived.state.commitment!.game}
            epoch={revived.state.commitment!.epoch}
            players={revived.pkg.players}
          />
        )}
      </div>
    </div>
  );
}

function Download({ name, bytes, children }: { name: string; bytes: Uint8Array; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
      className="rounded-md border border-line-strong px-4 py-3 text-sm text-ink-2 hover:border-acid hover:text-acid"
    >
      ↓ {children}
    </button>
  );
}
