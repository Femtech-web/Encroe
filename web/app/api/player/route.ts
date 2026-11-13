import { json } from "@/lib/game/http";
import { readWorld } from "@/lib/game/server";
import { TICK_MS } from "@/lib/game/world";

/** One player's satchel, by key. */
export async function GET(req: Request) {
  const pk = new URL(req.url).searchParams.get("pk") ?? "";
  const world = await readWorld();
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
