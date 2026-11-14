import { view } from "@/lib/encroe/directory";
import { isEscrowId } from "@/lib/encroe/escrows";
import { OUTLAYER_API, VERIFIER_HASH } from "@/lib/encroe/outlayer";
import { json, overLimit, readBody } from "@/lib/game/http";

/**
 * The keystore key a studio encrypts an epoch's key row to: OutLayer's X25519 key for the pinned verifier, this
 * studio and this escrow's profile for the epoch. A public key: proxied only because OutLayer's API is not open to
 * every browser origin.
 */
export async function POST(req: Request) {
  const body = (await readBody(req)) as { escrow?: unknown; epoch?: unknown; owner?: unknown } | null;
  if (!isEscrowId(body?.escrow) || !Number.isSafeInteger(body?.epoch) || typeof body?.owner !== "string")
    return json({ error: "expected {escrow, epoch, owner}" }, 400);
  if (await overLimit(req, "seal", 30, 3600)) return json({ error: "slow down" }, 429);
  const state = await view<{ secret_profile: string; owner: string }>(body.escrow, "get_state");
  if (!state) return json({ error: "not an Encroe escrow" }, 404);
  if (state.owner !== body.owner) return json({ error: `only the studio (${state.owner}) seals this escrow` }, 403);
  const profile = `${state.secret_profile}-${body.epoch}`;
  const res = await fetch(`${OUTLAYER_API}/secrets/pubkey`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessor: { type: "WasmHash", hash: VERIFIER_HASH },
      owner: body.owner,
      profile,
      secrets_json: "{}",
    }),
    cache: "no-store",
  });
  const out = (await res.json().catch(() => null)) as { pubkey?: string } | null;
  if (!res.ok || !out?.pubkey) return json({ error: `OutLayer: HTTP ${res.status}` }, 502);
  return json({ pubkey: out.pubkey, profile });
}
