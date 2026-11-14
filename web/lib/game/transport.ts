import { getJson, send, type Me } from "./client";
import type { GameId } from "./games";
import { standing } from "./standing";
import { signMove, type Move } from "./moves";
import { CAPACITY, TICK_MS, describe, play, type World } from "./world";

export type WorldView = {
  players: number;
  capacity: number;
  tick_ms: number;
  core_sha256: string;
  board: { name: string; pk: string; title: string; renown: number }[];
  events: { at: number; kind: string; item?: number; text: string }[];
  sealed: { escrow: string; epoch: number; root: string; sealed_at: number; players: number } | null;
};

/** Where the game runs: the studio's server while it lives, this browser once the game is revived. */
export interface Transport {
  me(pk: string): Promise<Me | null>;
  move(sk: Uint8Array, move: Move): Promise<Me>;
  world(): Promise<WorldView>;
  /** Set when the world runs here, revived from a released escrow. */
  revived?: { escrow: string; epoch: number };
}

export const SERVER: Transport = {
  me: (pk) => getJson<Me>(`/api/player?pk=${pk}`),
  move: (sk, move) => send(sk, move),
  world: async () => (await getJson<WorldView>("/api/world"))!,
};

export function view(world: World, coreSha256: string, game: GameId = "embergate"): WorldView {
  return {
    players: world.players.length,
    capacity: CAPACITY,
    tick_ms: TICK_MS,
    core_sha256: coreSha256,
    board: world.players
      .map((p) => {
        const st = standing(game, p.items);
        return { name: p.name, pk: p.pk, title: st.title, renown: st.score };
      })
      .sort((a, b) => b.renown - a.renown)
      .slice(0, 10),
    events: world.events
      .slice(-20)
      .reverse()
      .map((e) => ({ at: e.at, kind: e.kind, item: e.item, text: describe(e) })),
    sealed: null,
  };
}

/**
 * A revived world, hosted by this browser: the same signed moves and the same `play` the studio's server ran,
 * against the core that came out of the escrow. It is kept in this browser's storage.
 */
export function local(
  escrow: string,
  epoch: number,
  start: World,
  module: WebAssembly.Module,
  coreSha256: string,
): Transport {
  const key = `encroe:revived:${escrow}:${epoch}`;
  let world = start;
  try {
    const saved = localStorage.getItem(key);
    if (saved) world = JSON.parse(saved) as World;
  } catch {}
  const me = (pk: string): Me | null => {
    const p = world.players.find((x) => x.pk === pk);
    return p ? { name: p.name, items: p.items, nonce: p.nonce, next_gather_at: (p.tick + 1) * TICK_MS } : null;
  };
  let lastNonce = 0;
  return {
    revived: { escrow, epoch },
    me: async (pk) => me(pk),
    world: async () => view(world, coreSha256),
    move: async (sk, move) => {
      lastNonce = Math.max(Date.now(), lastNonce + 1);
      const s = signMove(sk, move, lastNonce);
      const out = await play(world, s, Date.now(), module);
      if (!out.ok) throw new Error(out.reason);
      world = out.world;
      try {
        localStorage.setItem(key, JSON.stringify(world));
      } catch {}
      return me(s.pk)!;
    },
  };
}
