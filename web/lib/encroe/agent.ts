import { functionCall } from "../chain/tx";
import { CATALOGS } from "../cores/catalog";
import { viewStatus } from "../game/near";
import { getStore } from "../game/store";
import { factoryListings } from "./directory";
import { CORE_RUNS, ESCROWS } from "./escrows";
import { NotReleased, revive, type Step } from "./revive";

/**
 * The preservation agent: it watches every escrow it knows (the factory's directory, the site's public world, the
 * language runs) and does, without anyone's permission, what anyone may do. When a studio's heartbeat lapses it
 * releases the escrow; when an escrow is released it brings the game back from public data and checks it, and
 * keeps the report. It leaves the kill-a-studio pool alone: those escrows are for visitors to release.
 */

export type Report = {
  escrow: string;
  at: number;
  ok: boolean;
  game?: string;
  language?: string;
  epoch?: number;
  players?: number;
  items?: number;
  steps: Step[];
  error?: string;
};

export type Action = { at: number; escrow: string; did: "released" | "revived" | "watched"; note: string; tx?: string };

const REPORTS = "agent:reports";
const LOG = "agent:log";

export async function watchList(): Promise<string[]> {
  const listings = await factoryListings();
  return [
    ...new Set([...listings.map((l) => l.escrow), ...ESCROWS.map((e) => e.id), ...CORE_RUNS.map((c) => c.escrow)]),
  ];
}

/** Brings one released escrow back, from the chain and FastFS only, and reports every check. */
export async function check(escrow: string): Promise<Report> {
  const steps: Step[] = [];
  try {
    const r = await revive(escrow, (s) => steps.push(s));
    const catalog = CATALOGS[r.state.commitment!.core_sha256];
    return {
      escrow,
      at: Date.now(),
      ok: steps.every((s) => s.ok),
      game: catalog?.game ?? r.pkg.game,
      language: catalog?.language,
      epoch: r.pkg.epoch,
      players: r.pkg.players.length,
      items: r.pkg.players.reduce((n, p) => n + p.items.reduce((m, [, q]) => m + q, 0), 0),
      steps,
    };
  } catch (e) {
    return {
      escrow,
      at: Date.now(),
      ok: false,
      steps,
      error: e instanceof NotReleased ? e.message : (e as Error).message,
    };
  }
}

async function append<T>(key: string, item: T, keep: number): Promise<void> {
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.get<T[]>(key);
    if (await store.put(key, [item, ...(cur?.value ?? [])].slice(0, keep), cur?.rev ?? 0)) return;
  }
}

export async function reports(): Promise<Report[]> {
  return (await getStore().get<Report[]>(REPORTS))?.value ?? [];
}

export async function log(): Promise<Action[]> {
  return (await getStore().get<Action[]>(LOG))?.value ?? [];
}

/** One pass over every watched escrow. Releasing needs the relayer's key; reviving needs nothing. */
export async function sweep(now = Date.now()): Promise<Action[]> {
  const account = process.env.ENCROE_RELAYER_ACCOUNT;
  const secret = process.env.ENCROE_RELAYER_KEY;
  const done = new Set((await reports()).filter((r) => r.ok).map((r) => r.escrow));
  const actions: Action[] = [];
  for (const escrow of await watchList()) {
    const s = await viewStatus(escrow).catch(() => null);
    if (!s) continue;
    if (s.phase !== "released" && s.phase !== "releasing" && s.release_condition_met && account && secret) {
      const { hash } = await functionCall(account, secret, escrow, "release", {}, 100);
      actions.push({ at: now, escrow, did: "released", note: "the studio went silent past its grace", tx: hash });
    } else if (s.phase === "released" && !done.has(escrow)) {
      const r = await check(escrow);
      await append(REPORTS, r, 50);
      actions.push({
        at: now,
        escrow,
        did: "revived",
        note: r.ok
          ? `all ${r.steps.length} checks passed: ${r.players} players, ${r.items} items`
          : `failed: ${r.error}`,
      });
    }
  }
  if (!actions.length)
    actions.push({ at: now, escrow: "*", did: "watched", note: "no studio silent, nothing new released" });
  for (const a of actions.toReversed()) await append(LOG, a, 100);
  return actions;
}
