import { functionCall } from "@/lib/chain/tx";
import { isEscrowId } from "@/lib/encroe/escrows";
import { viewStatus } from "@/lib/game/near";
import { json, overLimit, readBody } from "@/lib/game/http";

/**
 * Releases a silent escrow for someone without a NEAR wallet. `release` is open to anyone once the studio's
 * heartbeat lapses; this only pays the gas, from a throwaway testnet account (ENCROE_RELAYER_*). The contract
 * decides; we check first only so no one pays for a call it would refuse.
 */
export async function POST(req: Request) {
  const account = process.env.ENCROE_RELAYER_ACCOUNT;
  const secret = process.env.ENCROE_RELAYER_KEY;
  if (!account || !secret) return json({ error: "releasing from the site is not configured here" }, 503);
  const escrow = ((await readBody(req)) as { escrow?: unknown } | null)?.escrow;
  if (!isEscrowId(escrow)) return json({ error: "escrow: an Encroe escrow account" }, 400);
  if (await overLimit(req, "release", 10, 3600)) return json({ error: "too many releases from here this hour" }, 429);

  const s = await viewStatus(escrow);
  if (s.phase === "released" || s.phase === "releasing") return json({ error: "already released", status: s }, 409);
  if (!s.release_condition_met) return json({ error: "the studio's heartbeat is still live", status: s }, 409);
  try {
    const { hash } = await functionCall(account, secret, escrow, "release", {}, 100);
    return json({ tx: hash, from: account });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message.slice(0, 200) : "send failed" }, 502);
  }
}
