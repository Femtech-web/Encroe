/** Reads NEAR straight from its public RPCs, so a browser trusts the chain, not this site. */

export const RPC = "https://test.rpc.fastnear.com";
/**
 * Every RPC the site reads NEAR through, in order. They serve the same chain; when one rate-limits, errs or stalls,
 * the next answers. NEAR's own and Intear's are slower, so FastNEAR goes first.
 */
export const RPCS = [RPC, "https://rpc.testnet.near.org", "https://testnet-rpc.intea.rs"];

export type EscrowStatus = {
  phase: "live" | "ending" | "silent" | "releasing" | "released";
  badge: "unsealed" | "unverified" | "pending" | "awaiting-proof" | "red" | "green";
  game: string | null;
  epoch: number | null;
  root: string | null;
  players: number | null;
  pkg_sha256: string | null;
  proven_run: number | null;
  last_heartbeat_ns: string;
  grace_ns: string;
  lapses_at_ns: string | null;
  release_condition_met: boolean;
  released_by: string | null;
  released_at_ns: string | null;
};

type Body<T> = { result?: T; error?: { message?: string; cause?: { name?: string } } };

/**
 * One JSON-RPC call, tried on each RPC in turn when one is rate-limited, down or slower than `timeoutMs`. A chain
 * error (an unknown account, a contract panic) is an answer, not a failure, and comes back as it is.
 */
export async function rpcCall<T>(
  method: string,
  params: unknown,
  { rpcs = RPCS, timeoutMs = 8000 }: { rpcs?: string[]; timeoutMs?: number } = {},
): Promise<Body<T>> {
  let last = "no RPC answered";
  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "encroe", method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        last = `${new URL(url).host}: HTTP ${res.status}`;
        continue;
      }
      return (await res.json()) as Body<T>;
    } catch (e) {
      last = `${new URL(url).host}: ${(e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message}`;
    }
  }
  throw new Error(last);
}

// Views a server page makes again and again (every escrow's status, on every visit) are kept for a few seconds,
// and identical reads in flight are made once. Blocks are about a second apart; nothing here needs fresher.
const VIEW_TTL_MS = 4000;
const views = new Map<string, { at: number; value: Promise<unknown> }>();

/** A `query` (a contract view, an account's code or keys) through `rpcCall`, briefly shared between callers. */
export function query<T>(params: Record<string, unknown>, rpcs = RPCS): Promise<Body<T>> {
  const key = `${rpcs[0]}|${JSON.stringify(params)}`;
  const hit = views.get(key);
  if (hit && Date.now() - hit.at < VIEW_TTL_MS) return hit.value as Promise<Body<T>>;
  const value = rpcCall<T>("query", { finality: "final", ...params }, { rpcs });
  views.set(key, { at: Date.now(), value });
  value.catch(() => views.delete(key));
  if (views.size > 500) for (const [k, v] of views) if (Date.now() - v.at >= VIEW_TTL_MS) views.delete(k);
  return value;
}

/** Any contract view, straight from NEAR (browser or server). Throws when no RPC answers or the view fails. */
export async function viewCall<T>(account: string, method: string, args: object = {}, rpc?: string): Promise<T> {
  const body = await query<{ result: number[] }>(
    {
      request_type: "call_function",
      account_id: account,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
    rpc ? [rpc] : RPCS,
  );
  if (!body.result) throw new Error(`${account}.${method}: ${body.error?.message ?? "no result"}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T;
}

export function viewStatus(escrow: string, rpc?: string): Promise<EscrowStatus> {
  return viewCall<EscrowStatus>(escrow, "status", {}, rpc);
}
