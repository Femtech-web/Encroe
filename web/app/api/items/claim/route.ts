import { functionCall } from "@/lib/chain/tx";
import { claimable, isEvmAddress, ITEMS_CONTRACT, type ClaimArgs } from "@/lib/encroe/items";
import { json, overLimit, readBody } from "@/lib/game/http";

const HEX32 = /^[0-9a-f]{64}$/;

/**
 * Sends a player's claim to encroe-items, paying only the gas: the claim is the player's own (signed by their game
 * key, checked by the contract against the escrow's root), so the relayer can neither forge nor alter one.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const account = process.env.ENCROE_RELAYER_ACCOUNT;
  const secret = process.env.ENCROE_RELAYER_KEY;
  if (!account || !secret) return json({ error: "not configured here" }, 503);
  const b = (await readBody(req)) as Partial<ClaimArgs> | null;
  if (
    !b ||
    typeof b.escrow !== "string" ||
    !claimable(b.escrow) ||
    !HEX32.test(b.player ?? "") ||
    !HEX32.test(b.salt ?? "") ||
    !isEvmAddress(b.to ?? "") ||
    !/^[0-9a-f]{128}$/.test(b.signature ?? "") ||
    !Array.isArray(b.items) ||
    !Array.isArray(b.path)
  )
    return json({ error: "expected a claim: {escrow, player, items, salt, path, to, signature}" }, 400);
  if (await overLimit(req, "items", 10, 3600)) return json({ error: "slow down" }, 429);
  const args = {
    escrow: b.escrow,
    player: b.player,
    items: b.items,
    salt: b.salt,
    path: b.path,
    to: b.to,
    signature: b.signature,
  };
  try {
    const { hash, refusal } = await functionCall(account, secret, ITEMS_CONTRACT, "claim", args, 300, { settle: true });
    return json({ tx: hash, refusal }, refusal ? 422 : 200);
  } catch (e) {
    // The MPC network signs a few blocks later; an RPC that stops waiting first has still sent the claim.
    if (/TIMEOUT/i.test((e as Error).message)) return json({ tx: null, pending: true });
    throw e;
  }
}
