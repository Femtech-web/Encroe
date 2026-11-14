import { functionCall } from "@/lib/chain/tx";
import { view } from "@/lib/encroe/directory";
import { isEscrowId } from "@/lib/encroe/escrows";
import { fastfsPayload } from "@/lib/encroe/fastfs";
import { sha256Hex } from "@/lib/encroe/release";
import { packageUrl } from "@/lib/encroe/revive";
import { json, overLimit } from "@/lib/game/http";

/**
 * Puts a sealed package on NEAR (FastFS) for a studio that sealed in its browser: the relayer sends it, and only a
 * package whose hash the escrow has already committed, so nothing else can be posted through here.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const account = process.env.ENCROE_RELAYER_ACCOUNT;
  const secret = process.env.ENCROE_RELAYER_KEY;
  if (!account || !secret) return json({ error: "not configured here" }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > 1_500_000) return json({ error: "package too large" }, 413);
  const body = (await req.json().catch(() => null)) as { escrow?: unknown; package_b64?: unknown } | null;
  if (!isEscrowId(body?.escrow) || typeof body?.package_b64 !== "string")
    return json({ error: "expected {escrow, package_b64}" }, 400);
  if (await overLimit(req, "fastfs", 10, 3600)) return json({ error: "slow down" }, 429);
  const sealed = new Uint8Array(Buffer.from(body.package_b64, "base64"));
  const sha = sha256Hex(sealed);
  // A commit sent a moment ago is final within a few blocks.
  let committed = false;
  for (let i = 0; i < 6 && !committed; i++) {
    if (i) await new Promise((r) => setTimeout(r, 2500));
    const state = await view<{ commitment: { pkg_sha256: string } | null }>(body.escrow, "get_state");
    committed = state?.commitment?.pkg_sha256 === sha;
  }
  if (!committed) return json({ error: "commit the epoch first: this package is not the one the escrow holds" }, 409);
  const { payload } = fastfsPayload(sealed);
  // FastFS indexes the call's arguments; the call itself is meant to fail (1 gas).
  const { hash } = await functionCall(account, secret, body.escrow, "__fastdata_fastfs", {}, 0, {
    rawArgs: payload,
    gas: 1n,
  });
  return json({ tx: hash, url: packageUrl(account, body.escrow, sha) });
}
