import { RPC, viewStatus, type EscrowStatus } from "../game/near";
import { CATALOGS, type Catalog } from "../cores/catalog";
import { CORE_RUNS, ESCROWS } from "./escrows";
import POOL from "./pool.json";
import { viewState, type EscrowState } from "./revive";

/** The factory and directory contract: every escrow it creates is `<name>.encroe.testnet`, keyless from birth. */
export const FACTORY = "encroe.testnet";

export type Listing = {
  escrow: string;
  owner: string;
  game: string;
  grace_s: number;
  created_ns: number;
  created_by: string;
};

export type Origin = "factory" | "ours" | "pool";

export type Row = {
  id: string;
  origin: Origin;
  listing?: Listing;
  state: EscrowState | null;
  status: EscrowStatus | null;
  catalog?: Catalog;
  /** What this escrow shows, for our own runs. */
  note?: string;
};

export async function view<T>(account: string, method: string, args: object = {}): Promise<T | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: account,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        },
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: { result: number[] } };
    return body.result ? (JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T) : null;
  } catch {
    return null;
  }
}

/** Escrows studios created through the factory, oldest first; empty until it is deployed. */
export async function factoryListings(): Promise<Listing[]> {
  return (await view<Listing[]>(FACTORY, "list", { from: 0, limit: 100 })) ?? [];
}

/** One escrow as NEAR reports it now, with the game its sealed core is, when we know that core. */
export async function row(id: string, origin: Origin, listing?: Listing, note?: string): Promise<Row> {
  const [state, status] = await Promise.all([viewState(id).catch(() => null), viewStatus(id).catch(() => null)]);
  const core = state?.commitment?.core_sha256;
  return { id, origin, listing, state, status, catalog: core ? CATALOGS[core] : undefined, note };
}

/** Every escrow this site knows: the factory's directory first, then ours, then the kill-a-studio pool. */
export async function directory(): Promise<Row[]> {
  const listings = await factoryListings();
  const seen = new Set<string>();
  const entries: [string, Origin, Listing | undefined, string | undefined][] = [];
  const add = (id: string, origin: Origin, listing?: Listing, note?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    entries.push([id, origin, listing, note]);
  };
  for (const l of listings.toReversed()) add(l.escrow, "factory", l);
  for (const e of ESCROWS) add(e.id, "ours", undefined, e.story);
  for (const c of CORE_RUNS)
    add(c.escrow, "ours", undefined, `${c.game}'s ${c.language} core: sealed, verified, released, revived`);
  for (const p of POOL) add(p, "pool");
  return Promise.all(entries.map(([id, origin, listing, note]) => row(id, origin, listing, note)));
}

/** "releasable in 13 days", "silent for 2 hours", "released 3 hours ago": the heartbeat clock in words. */
export function clock(s: EscrowStatus, now = Date.now()): { text: string; tone: "live" | "silent" | "released" } {
  const ago = (ms: number) => human(now - ms);
  if (s.released_at_ns)
    return { text: `released ${ago(Number(BigInt(s.released_at_ns) / 1_000_000n))} ago`, tone: "released" };
  const lapse = s.lapses_at_ns ? Number(BigInt(s.lapses_at_ns) / 1_000_000n) : null;
  if (lapse && lapse <= now) return { text: `silent for ${ago(lapse)}: anyone may release it`, tone: "silent" };
  return { text: lapse ? `the heartbeat holds for ${human(lapse - now)}` : "no heartbeat yet", tone: "live" };
}

export function human(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} seconds`;
  if (s < 5400) return `${Math.round(s / 60)} minutes`;
  if (s < 129600) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}
