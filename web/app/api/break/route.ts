import { functionCall } from "@/lib/chain/tx";
import { attack } from "@/lib/encroe/attacks";
import { json, overLimit, readBody } from "@/lib/game/http";

/**
 * One attack, sent for real from a throwaway testnet account (ENCROE_RELAYER_*). The escrow refuses it; nothing
 * on chain changes, and the attacker pays the gas. A burst of clicks shares one transaction per attack.
 */
const REUSE_MS = 20_000;
const last = new Map<string, { at: number; body: Record<string, unknown> }>();

export async function POST(req: Request) {
  const account = process.env.ENCROE_RELAYER_ACCOUNT;
  const secret = process.env.ENCROE_RELAYER_KEY;
  if (!account || !secret) return json({ error: "live attempts are not configured here" }, 503);
  const a = attack(((await readBody(req)) as { attack?: unknown } | null)?.attack);
  if (!a) return json({ error: "no such attack" }, 400);

  const seen = last.get(a.id);
  if (seen && Date.now() - seen.at < REUSE_MS) return json({ ...seen.body, reused: true });
  if (await overLimit(req, "break", 20, 3600)) return json({ error: "too many attempts from here this hour" }, 429);
  try {
    const sent = await functionCall(account, secret, a.escrow, a.method, await a.args(), a.tgas, { settle: true });
    const body = {
      attack: a.id,
      escrow: a.escrow,
      method: a.method,
      from: account,
      tx: sent.hash,
      refused: sent.refusal !== null,
      reason: sent.refusal,
      held: sent.refusal?.includes(a.expected) ?? false,
      at: new Date().toISOString(),
    };
    last.set(a.id, { at: Date.now(), body });
    return json(body);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message.slice(0, 200) : "send failed" }, 502);
  }
}
