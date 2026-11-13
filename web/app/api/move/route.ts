import { json, overLimit, readBody } from "@/lib/game/http";
import { parseSignedMove } from "@/lib/game/moves";
import { act } from "@/lib/game/server";
import { TICK_MS } from "@/lib/game/world";

/** A signed move: the core decides it, the world is saved, and the player gets their satchel back. */
export async function POST(req: Request) {
  const s = parseSignedMove(await readBody(req));
  if (typeof s === "string") return json({ error: s }, 400);
  if (await overLimit(req, "move", 240, 60)) return json({ error: "slow down" }, 429);
  if (s.move.kind === "join" && (await overLimit(req, "join", 6, 3600)))
    return json({ error: "too many new players from here this hour" }, 429);

  const out = await act(s);
  if (!out.ok) return json({ error: out.reason }, out.status);
  const p = out.player;
  return json({ name: p.name, items: p.items, nonce: p.nonce, next_gather_at: (p.tick + 1) * TICK_MS });
}
