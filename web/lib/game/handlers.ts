import { json, overLimit, readBody } from "./http";
import { parseSignedMove, signatureValid } from "./moves";
import { act, core, readSealed, readWorld } from "./server";
import { view } from "./transport";
import { FRESH_MS, TICK_MS, totals } from "./world";
import type { GameId } from "./games";

/**
 * The game API, for any game the site hosts: the routes under /api/games/[game] and Embergate's original ones
 * (/api/world, /api/player, /api/move, /api/proof) are thin wrappers around these.
 */

/** The world anyone can see: who is here, what happened lately, what NEAR holds sealed. No one's items. */
export async function worldView(game: GameId) {
  const [world, sealed, { sha256 }] = await Promise.all([readWorld(game), readSealed(game), core(game)]);
  return json({
    ...view(world, sha256, game),
    totals: totals(world),
    sealed: sealed && {
      escrow: sealed.escrow,
      epoch: sealed.epoch,
      root: sealed.root,
      sealed_at: sealed.sealed_at,
      players: sealed.players.length,
    },
  });
}

/** One player's items, by key. */
export async function player(req: Request, game: GameId) {
  const pk = new URL(req.url).searchParams.get("pk") ?? "";
  const world = await readWorld(game);
  const index = world.players.findIndex((p) => p.pk === pk);
  if (index < 0) return json({ error: "no player with that key" }, 404);
  const p = world.players[index];
  return json({
    index,
    name: p.name,
    items: p.items,
    since: p.since,
    next_gather_at: (p.tick + 1) * TICK_MS,
    nonce: p.nonce,
  });
}

/** A signed move: the core decides it, the world is saved, and the player gets their items back. */
export async function move(req: Request, game: GameId) {
  const s = parseSignedMove(await readBody(req));
  if (typeof s === "string") return json({ error: s }, 400);
  if (await overLimit(req, "move", 240, 60)) return json({ error: "slow down" }, 429);
  if (s.move.kind === "join" && (await overLimit(req, "join", 6, 3600)))
    return json({ error: "too many new players from here this hour" }, 429);
  const out = await act(s, Date.now(), game);
  if (!out.ok) return json({ error: out.reason }, out.status);
  const p = out.player;
  return json({ name: p.name, items: p.items, nonce: p.nonce, next_gather_at: (p.tick + 1) * TICK_MS, out: out.out });
}

/**
 * A player's own inclusion proof for the last sealed epoch: their items, salt and Merkle path. Only the key's
 * holder can ask, because the salt keeps their leaf private on chain. Their browser checks the path against the
 * root NEAR holds; this server is not trusted for that.
 */
export async function proof(req: Request, game: GameId) {
  const s = parseSignedMove(await readBody(req));
  if (typeof s === "string") return json({ error: s }, 400);
  if (s.move.kind !== "proof") return json({ error: "expected a signed proof request" }, 400);
  if (!signatureValid(s, game) || Math.abs(Date.now() - s.nonce) > FRESH_MS)
    return json({ error: "bad or stale signature" }, 401);
  if (await overLimit(req, "proof", 30, 60)) return json({ error: "slow down" }, 429);
  const sealed = await readSealed(game);
  if (!sealed) return json({ error: "nothing sealed yet" }, 404);
  const entry = sealed.players.find((p) => p.pk === s.pk);
  const { players, ...epoch } = sealed;
  if (!entry) return json({ error: "you joined after the last seal", epoch, players: players.length }, 404);
  return json({ epoch, entry });
}
