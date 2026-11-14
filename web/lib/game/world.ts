import { hexToBytes } from "@noble/hashes/utils.js";
import { CATALOGS } from "../cores/catalog";
import { Core } from "./core";
import { GAMES, type GameId } from "./games";
import { ITEMS, OUTCOMES, type Items, type ItemId } from "./items";
import { signatureValid, type SignedMove } from "./moves";

/** The core holds 64 players; the sealed snapshot and the enclave's checks are built for that size. */
export const CAPACITY = 64;
/** One gather per node visit per tick. */
export const TICK_MS = 2000;
/** A signed move older or newer than this is refused, so a captured one cannot be replayed later. */
export const FRESH_MS = 5 * 60_000;
const EVENTS_KEPT = 40;

export type Player = {
  pk: string;
  name: string;
  items: Items;
  /** The last nonce this player signed; each move must carry a larger one. */
  nonce: number;
  /** The last tick they gathered in. */
  tick: number;
  since: number;
};

export type WorldEvent = {
  at: number;
  name: string;
  kind: "join" | "gather" | "forge" | "gift" | "move";
  item?: number;
  qty?: number;
  to?: string;
  /** A catalog move's own words ("You won (squad 71 v 64), +420 coins"), or its label. */
  text?: string;
};

/** The live world as the studio's host stores it: players in the order the core indexes them. */
export type World = { v: 1; players: Player[]; events: WorldEvent[] };

export const EMPTY_WORLD: World = { v: 1, players: [], events: [] };

export type Outcome =
  { ok: true; world: World; player: Player; out?: number[] } | { ok: false; status: number; reason: string };

/** What the core's codes mean, for games other than Embergate (whose words are in items.ts). */
const CODES: Record<number, string> = {
  1: "not enough for that",
  2: "no such player",
  3: "no room for another kind of item",
  4: "one action per tick: wait a moment",
  5: "no such thing",
};

const refuse = (status: number, reason: string): Outcome => ({ ok: false, status, reason });

/**
 * Plays one signed move: the host loads the world into the core, makes the move there, and reads every
 * inventory back. The host only checks who signed and when; the core decides what happens.
 */
export async function play(
  world: World,
  s: SignedMove,
  now: number,
  module: WebAssembly.Module,
  game: GameId = "embergate",
): Promise<Outcome> {
  if (!signatureValid(s, game))
    return refuse(401, "the signature does not match this key (if this page is from before an update, reload it)");
  if (game !== "embergate" && ["gather", "forge", "gift"].includes(s.move.kind))
    return refuse(400, `${s.move.kind} is Embergate's move`);
  if (Math.abs(now - s.nonce) > FRESH_MS) return refuse(400, "this move was signed too long ago (or in the future)");
  if (s.move.kind === "proof") return refuse(400, "a proof request is not a move");
  const idx = world.players.findIndex((p) => p.pk === s.pk);
  if (idx < 0 && s.move.kind !== "join") return refuse(404, "join the world first");
  if (idx >= 0 && s.nonce <= world.players[idx].nonce) return refuse(409, "this move was already played");

  const core = await Core.create(module);
  core.load(world.players.map((p) => ({ pk: hexToBytes(p.pk), items: p.items })));
  world.players.forEach((p, i) => core.restoreTick(i, p.tick));

  const players = world.players.map((p) => ({ ...p }));
  const move = s.move;
  let me = idx;
  let event: WorldEvent;
  let code: number;
  let out: number[] | undefined;
  switch (move.kind) {
    case "join": {
      me = core.join(hexToBytes(s.pk));
      if (me < 0) return refuse(403, `the world is full: ${GAMES[game].name} holds ${CAPACITY} players`);
      if (me === players.length) players.push({ pk: s.pk, name: move.name, items: [], nonce: 0, tick: 0, since: now });
      else players[me].name = move.name;
      code = 0;
      event = { at: now, name: move.name, kind: "join" };
      break;
    }
    case "gather": {
      const tick = Math.floor(now / TICK_MS);
      code = core.gather(me, move.node, tick);
      if (code === 0) players[me].tick = tick;
      event = { at: now, name: players[me].name, kind: "gather", item: move.node, qty: 1 };
      break;
    }
    case "forge": {
      code = core.craft(me, move.recipe);
      event = { at: now, name: players[me].name, kind: "forge", item: forged(move.recipe) };
      break;
    }
    case "gift": {
      const to = players.findIndex((p) => p.pk === move.to);
      if (to < 0) return refuse(404, "no player with that key");
      code = core.trade(me, to, move.item, move.qty);
      event = { at: now, name: players[me].name, kind: "gift", item: move.item, qty: move.qty, to: players[to].name };
      break;
    }
    case "call": {
      // Only moves the game declares; the server, not the player, supplies the player's index and every tick.
      const spec = CATALOGS[GAMES[game].sha256]?.moves?.find((m) => m.name === move.name);
      if (!spec) return refuse(400, `${GAMES[game].name} has no move ${move.name}`);
      const tick = Math.floor(now / TICK_MS);
      const given = [...move.args];
      code = core.call(spec.name, me, ...spec.args.map((a) => (a.kind === "tick" ? tick : (given.shift() ?? 0))));
      if (code === 0 && spec.args.some((a) => a.kind === "tick")) players[me].tick = tick;
      out = code === 0 && spec.says ? core.out(spec.says.words) : undefined;
      event = {
        at: now,
        name: players[me].name,
        kind: "move",
        text: out && spec.says ? spec.says.read(out) : spec.label,
      };
      break;
    }
  }
  if (code !== 0) return refuse(422, (game === "embergate" ? OUTCOMES : CODES)[code] ?? `the core refused (${code})`);

  players.forEach((p, i) => (p.items = core.items(i)));
  players[me].nonce = s.nonce;
  const events = [...world.events, event].slice(-EVENTS_KEPT);
  return { ok: true, world: { v: 1, players, events }, player: players[me], out };
}

function forged(recipe: number): ItemId | undefined {
  return ([9, 10, 11, 12, 13, 14] as const)[recipe - 1];
}

/** Every item in the world, by id: trades and gifts never change these totals. */
export function totals(world: World): Record<number, number> {
  const sum: Record<number, number> = {};
  for (const p of world.players) for (const [id, q] of p.items) sum[id] = (sum[id] ?? 0) + q;
  return sum;
}

export function describe(e: WorldEvent): string {
  const item = e.item && e.item in ITEMS ? ITEMS[e.item as ItemId].name : "";
  switch (e.kind) {
    case "join":
      return `${e.name} joined`;
    case "gather":
      return `${e.name} gathered ${item}`;
    case "forge":
      return `${e.name} forged a ${item}`;
    case "gift":
      return `${e.name} gave ${e.qty} ${item} to ${e.to}`;
    case "move":
      return `${e.name}: ${e.text}`;
  }
}
