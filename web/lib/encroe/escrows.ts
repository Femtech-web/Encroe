import { RPC, viewStatus, type EscrowStatus } from "../game/near";
import POOL from "./pool.json";

export const REPO = "https://github.com/Femtech-web/Encroe";

/** The escrows this site points at, each with the run that recorded it (docs/results/escrow/<results>). */
export const ESCROWS: { id: string; results: string; story: string }[] = [
  {
    id: "encroe-ember-3924.testnet",
    results: "ember-3924",
    story: "Embergate's played world: sealed, verified green, checked by its own players",
  },
  {
    id: "encroe-kill-beaa.testnet",
    results: "kill-beaa",
    story: "Killed from this site: a visitor's click released it, the browser brought it back",
  },
  {
    id: "encroe-kill-827e.testnet",
    results: "kill-827e",
    story: "A silent studio: released by a stranger, revived and played on in a browser",
  },
  {
    id: "encroe-life-52e4.testnet",
    results: "life-52e4",
    story: "The first full life: a broken build caught red, the real one green, the studio's silence, the release",
  },
];

export async function accessKeys(account: string): Promise<number | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "query",
        params: { request_type: "view_access_key_list", finality: "final", account_id: account },
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: { keys: unknown[] } };
    return body.result ? body.result.keys.length : null;
  } catch {
    return null;
  }
}

export type Live = { id: string; results: string; story: string; status: EscrowStatus | null; keys: number | null };

/** Each escrow as NEAR reports it right now; a failed read shows as unknown, never as a made-up state. */
export async function liveEscrows(): Promise<Live[]> {
  return Promise.all(
    ESCROWS.map(async (e) => {
      const [status, keys] = await Promise.all([viewStatus(e.id).catch(() => null), accessKeys(e.id)]);
      return { ...e, status, keys };
    }),
  );
}

/** A silent studio nobody has released yet, for a visitor to kill; or the latest one already released. */
export async function killTarget(): Promise<{ escrow: string; fresh: boolean } | null> {
  const pool = [...POOL].reverse();
  const states = await Promise.all(pool.map((id) => viewStatus(id).catch(() => null)));
  const i = states.findIndex((s) => s && s.phase !== "released" && s.phase !== "releasing");
  if (i >= 0) return { escrow: pool[i], fresh: true };
  return pool.length ? { escrow: pool[0], fresh: false } : null;
}
