import { json, overLimit, readBody } from "@/lib/game/http";
import { parseSignedMove, signatureValid } from "@/lib/game/moves";
import { readSealed } from "@/lib/game/server";
import { FRESH_MS } from "@/lib/game/world";

/**
 * A player's own inclusion proof for the last sealed epoch: their items, salt and Merkle path. Only the key's
 * holder can ask, because the salt is what keeps their leaf private on chain. Their browser checks the path
 * against the root NEAR holds; this server is not trusted for that.
 */
export async function POST(req: Request) {
  const s = parseSignedMove(await readBody(req));
  if (typeof s === "string") return json({ error: s }, 400);
  if (s.move.kind !== "proof") return json({ error: "expected a signed proof request" }, 400);
  if (!signatureValid(s) || Math.abs(Date.now() - s.nonce) > FRESH_MS)
    return json({ error: "bad or stale signature" }, 401);
  if (await overLimit(req, "proof", 30, 60)) return json({ error: "slow down" }, 429);

  const sealed = await readSealed();
  if (!sealed) return json({ error: "nothing sealed yet" }, 404);
  const entry = sealed.players.find((p) => p.pk === s.pk);
  const { players, ...epoch } = sealed;
  if (!entry) return json({ error: "you joined after the last seal", epoch, players: players.length }, 404);
  return json({ epoch, entry });
}
