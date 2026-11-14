import { view } from "@/lib/encroe/directory";
import { isEscrowId } from "@/lib/encroe/escrows";
import { getStore } from "@/lib/game/store";
import { json, overLimit, readBody } from "@/lib/game/http";

/**
 * Verification runs waiting for NEAR's quote check. A studio that sealed in its browser queues its run here; the
 * prover (.github/workflows/prove.yml) fetches the enclave's attestation and relays it to NEAR's DCAP verifier,
 * which anyone may do. GET lists the runs ready for it: the enclave's output passed, and the quote is not yet proven.
 */
type Queued = { escrow: string; index: number; request_id: number; at: number };
type Run = { kind: string; output: string | null; output_ok: boolean; t1: string | null };
const KEY = "prove:queue";

export async function GET() {
  const q = (await getStore().get<Queued[]>(KEY))?.value ?? [];
  const ready = await Promise.all(
    q.map(async (e) => {
      const run = (await view<Run[]>(e.escrow, "get_runs"))?.[e.index];
      return run?.kind === "verify" && run.output_ok && !run.t1 ? e : null;
    }),
  );
  return json(ready.filter((e) => e !== null));
}

export async function POST(req: Request) {
  const body = (await readBody(req)) as { escrow?: unknown; index?: unknown; request_id?: unknown } | null;
  if (!isEscrowId(body?.escrow) || !Number.isSafeInteger(body?.index) || !Number.isSafeInteger(body?.request_id))
    return json({ error: "expected {escrow, index, request_id}" }, 400);
  if (await overLimit(req, "prove", 20, 3600)) return json({ error: "slow down" }, 429);
  const { escrow, index, request_id } = body as { escrow: string; index: number; request_id: number };
  const run = (await view<Run[]>(escrow, "get_runs"))?.[index];
  if (run?.kind !== "verify") return json({ error: "no such verification run" }, 404);
  if (run.t1) return json({ queued: false, proven: run.t1 });
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.get<Queued[]>(KEY);
    const rest = (cur?.value ?? []).filter((e) => !(e.escrow === escrow && e.index === index));
    if (await store.put(KEY, [...rest, { escrow, index, request_id, at: Date.now() }].slice(-50), cur?.rev ?? 0))
      return json({ queued: true });
  }
  return json({ error: "busy" }, 503);
}
