import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { Core, type Seat } from "../game/core";
import type { Items } from "../game/items";

/**
 * The checks a game core must pass before a studio seals it: the same contract the enclave's pinned verifier
 * holds it to (no imports; the shared exports; every committed state served byte for byte; items conserved
 * across seeded trades of items 1 to 8), run on a generated 64-player world. Used by /tools and by the tests.
 */

/** What the enclave's verifier calls. */
export const REQUIRED = ["memory", "input_ptr", "output_ptr", "load", "get_state", "trade"];
/** What a host (and a browser bringing the game back) also needs: who each player is. */
export const HOST = ["player_count", "get_key"];

export type CheckResult = { id: string; label: string; ok: boolean; detail: string };
export type CoreReport = { sha256: string; bytes: number; ok: boolean; checks: CheckResult[]; moves: string[] };

/** The verifier's draw: SHA-256(seed ‖ label ‖ i), the first 4 bytes little-endian. */
export function draw(seed: string, label: string, i: number): number {
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, i, true);
  const d = sha256(new Uint8Array([...utf8ToBytes(seed), ...utf8ToBytes(label), ...n]));
  return new DataView(d.buffer).getUint32(0, true);
}

/** A world of `players` seats with 1 to 12 kinds of items each (ids 1 to 40), ids ascending. */
export function testWorld(seed: string, players = 64): Seat[] {
  return Array.from({ length: players }, (_, p) => {
    const kinds = new Set<number>();
    for (let i = 0; i < 1 + (draw(seed, `kinds${p}`, 0) % 12); i++) kinds.add(1 + (draw(seed, `id${p}`, i) % 40));
    const items: Items = [...kinds].sort((a, b) => a - b).map((id) => [id, 1 + (draw(seed, `q${p}`, id) % 9)]);
    const pk = new Uint8Array(32);
    pk[0] = p + 1;
    pk[31] = 0xe7;
    return { pk, items };
  });
}

export function totals(seats: Seat[]): Record<number, number> {
  const t: Record<number, number> = {};
  for (const s of seats) for (const [id, q] of s.items) t[id] = (t[id] ?? 0) + q;
  return t;
}

const same = (a: Record<number, number>, b: Record<number, number>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** Runs every check on a compiled core; the first failure does not stop the rest, so a studio sees them all. */
export async function checkCore(bytes: Uint8Array, seeds = ["encroe-a", "encroe-b", "encroe-c"]): Promise<CoreReport> {
  const checks: CheckResult[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });
  const report = (moves: string[] = []) => ({
    sha256: bytesToHex(sha256(bytes)),
    bytes: bytes.length,
    ok: checks.length > 0 && checks.every((c) => c.ok),
    checks,
    moves,
  });

  let compiled: WebAssembly.Module;
  try {
    compiled = await WebAssembly.compile(bytes as BufferSource);
  } catch (e) {
    add("wasm", "It is WebAssembly", false, (e as Error).message);
    return report();
  }
  add("wasm", "It is WebAssembly", true, `${bytes.length} bytes`);

  const imports = WebAssembly.Module.imports(compiled);
  add(
    "imports",
    "It imports nothing",
    imports.length === 0,
    imports.length
      ? `imports ${imports.map((i) => `${i.module}.${i.name}`).join(", ")}`
      : "it can reach nothing but its own memory",
  );
  const exported = WebAssembly.Module.exports(compiled).map((e) => e.name);
  const missing = REQUIRED.filter((f) => !exported.includes(f));
  add(
    "abi",
    "It exports what the enclave calls",
    missing.length === 0,
    missing.length ? `missing ${missing.join(", ")}` : REQUIRED.join(", "),
  );
  const noHost = HOST.filter((f) => !exported.includes(f));
  add(
    "host",
    "It names its players, so it can be brought back",
    noHost.length === 0,
    noHost.length ? `missing ${noHost.join(", ")}` : HOST.join(", "),
  );
  const moves = exported.filter((f) => !REQUIRED.includes(f) && !HOST.includes(f));
  if (imports.length || missing.length || noHost.length) return report(moves);

  let served = true;
  let conserved = true;
  let canonical = true;
  let applied = 0;
  let rejectsOverflow = true;
  try {
    for (const seed of seeds) {
      const core = await Core.create(compiled);
      const seats = testWorld(seed);
      core.load(seats);
      served &&= JSON.stringify(core.seats()) === JSON.stringify(seats.map((s) => ({ pk: s.pk, items: s.items })));
      for (let t = 0; t < 400; t++) {
        const code = core.trade(
          draw(seed, "from", t) % 64,
          draw(seed, "to", t) % 64,
          (draw(seed, "item", t) % 8) + 1,
          (draw(seed, "qty", t) % 3) + 1,
        );
        if (code === 0) applied++;
      }
      const after = core.seats();
      conserved &&= same(totals(after), totals(seats));
      canonical &&= after.every(
        (s) =>
          s.items.length <= 16 && s.items.every(([, q], i) => q > 0 && (i === 0 || s.items[i - 1][0] < s.items[i][0])),
      );
    }
    const core = await Core.create(compiled);
    try {
      core.load(Array.from({ length: 65 }, (_, i) => ({ pk: new Uint8Array(32).fill(i), items: [] })));
      rejectsOverflow = false;
    } catch {
      rejectsOverflow = true;
    }
  } catch (e) {
    add("run", "It runs", false, (e as Error).message);
    return report(moves);
  }
  add("served", "It serves every committed state, byte for byte", served, `${seeds.length} worlds of 64 players`);
  add(
    "conserved",
    "Trades create and destroy nothing",
    conserved,
    `${applied} of ${seeds.length * 400} seeded trades applied; totals unchanged`,
  );
  add("canonical", "States stay canonical", canonical, "ids ascending, no zero quantities, at most 16 kinds");
  add("bounds", "It refuses a world too big to seal", rejectsOverflow, "a 65-player snapshot is refused");
  return report(moves);
}
