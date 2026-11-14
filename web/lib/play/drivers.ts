import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { CoreMove } from "../cores/catalog";
import { getJson, send } from "../game/client";
import { Core } from "../game/core";
import type { GameId } from "../game/games";
import type { Items } from "../game/items";
import { publicKeyOf } from "../game/moves";
import { standing } from "../game/standing";
import type { PackagePlayer } from "../encroe/release";

export type Standing = { name: string; pk: string; title: string; score: number };

/** What the generic game screen needs from wherever the game runs: the studio's server, or this browser. */
export interface Driver {
  me(): Promise<{ name: string; items: Items } | null>;
  join(name: string): Promise<void>;
  /** A catalog move; `args` are the player's own choices (the server or this browser adds index and tick). */
  call(move: CoreMove, args: number[]): Promise<{ ok: boolean; text: string }>;
  world(): Promise<{ players: number; board: Standing[]; events: string[] }>;
}

const CODES: Record<number, string> = {
  1: "not enough for that",
  2: "no such player",
  3: "no room for another kind of item",
  4: "one action per tick: wait a moment",
  5: "no such thing",
};
const TICK_MS = 2000;

/** The game as the studio hosts it: every move signed by this browser's key and decided by the sealed core. */
export function serverDriver(game: GameId, sk: Uint8Array): Driver {
  const pk = publicKeyOf(sk);
  const base = `/api/games/${game}`;
  return {
    async me() {
      const p = await getJson<{ name: string; items: Items }>(`${base}/player?pk=${pk}`);
      return p && { name: p.name, items: p.items };
    },
    async join(name) {
      await send(sk, { kind: "join", name }, `${base}/move`, game);
    },
    async call(move, args) {
      try {
        const r = await send<{ out?: number[] }>(sk, { kind: "call", name: move.name, args }, `${base}/move`, game);
        return { ok: true, text: r.out && move.says ? move.says.read(r.out) : `${move.label}: done` };
      } catch (e) {
        return { ok: false, text: (e as Error).message };
      }
    },
    async world() {
      const w = await getJson<{
        players: number;
        board: { name: string; pk: string; title: string; renown: number }[];
        events: { text: string }[];
      }>(`${base}/world`);
      return {
        players: w?.players ?? 0,
        board: (w?.board ?? []).map((b) => ({ name: b.name, pk: b.pk, title: b.title, score: b.renown })),
        events: (w?.events ?? []).map((e) => e.text),
      };
    },
  };
}

/** A revived world, run by this browser on the core that came out of the escrow. Nothing is sent anywhere. */
export async function localDriver(
  game: GameId | undefined,
  module: WebAssembly.Module,
  players: PackagePlayer[],
  sk: Uint8Array,
): Promise<Driver> {
  const core = await Core.create(module);
  core.load(players.map((p) => ({ pk: hexToBytes(p.pk), items: p.items })));
  const pk = publicKeyOf(sk);
  const names = new Map(players.map((p) => [p.pk, p.pk.slice(0, 8)]));
  const events: string[] = [];
  const index = () => core.seats().findIndex((s) => bytesToHex(s.pk) === pk);
  return {
    async me() {
      const i = index();
      return i < 0 ? null : { name: names.get(pk) ?? "you", items: core.items(i) };
    },
    async join(name) {
      core.join(hexToBytes(pk));
      names.set(pk, name);
      events.unshift(`${name} joined the revived world`);
    },
    async call(move, args) {
      const tick = Math.floor(Date.now() / TICK_MS);
      const given = [...args];
      const code = core.call(
        move.name,
        index(),
        ...move.args.map((a) => (a.kind === "tick" ? tick : (given.shift() ?? 0))),
      );
      if (code !== 0) return { ok: false, text: CODES[code] ?? `the core said ${code}` };
      const text = move.says ? move.says.read(core.out(move.says.words)) : `${move.label}: done`;
      events.unshift(`${names.get(pk)}: ${text}`);
      return { ok: true, text };
    },
    async world() {
      const seats = core.seats();
      return {
        players: seats.length,
        board: seats
          .map((s) => {
            const key = bytesToHex(s.pk);
            const st = game ? standing(game, s.items) : { score: 0, title: "" };
            return { name: names.get(key) ?? key.slice(0, 8), pk: key, title: st.title, score: st.score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 10),
        events: events.slice(0, 10),
      };
    },
  };
}
