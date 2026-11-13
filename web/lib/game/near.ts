/** Reads an Encroe escrow's `status()` straight from NEAR's RPC, so a browser trusts the chain, not this site. */

export const RPC = "https://test.rpc.fastnear.com";

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

export async function viewStatus(escrow: string, rpc = RPC): Promise<EscrowStatus> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: escrow,
        method_name: "status",
        args_base64: "e30=",
      },
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: { result: number[] }; error?: { message?: string } };
  if (!body.result) throw new Error(`${escrow}: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as EscrowStatus;
}
