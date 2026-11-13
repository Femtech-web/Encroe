import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Core, encodeSnapshot } from "./core";
import { ITEMS, RECIPES, STARTER, qtyOf } from "./items";

const wasm = readFileSync(path.join(__dirname, "../../public/core/embergate.wasm"));
const wasmModule = new WebAssembly.Module(wasm);
const key = (b: number) => new Uint8Array(32).fill(b);

describe("the sealed Embergate core", () => {
  it("exports exactly the ABI the Encroe verifier and this host call", () => {
    const names = WebAssembly.Module.exports(wasmModule).map((e) => e.name);
    for (const f of ["input_ptr", "output_ptr", "load", "player_count", "get_key", "get_state", "trade"])
      expect(names, f).toContain(f);
    for (const f of ["join", "gather", "craft", "restore_tick", "memory"]) expect(names, f).toContain(f);
    expect(WebAssembly.Module.imports(wasmModule)).toEqual([]);
  });

  it("round-trips a snapshot", async () => {
    const core = await Core.create(wasmModule);
    const seats = [
      {
        pk: key(1),
        items: [
          [1, 6],
          [14, 1],
        ] as [number, number][],
      },
      { pk: key(2), items: [] as [number, number][] },
    ];
    core.load(seats);
    expect(core.seats()).toEqual(seats);
    expect(encodeSnapshot(seats).length).toBe(4 + 36 + 16 + 36);
  });

  it("forges every recipe exactly as items.ts says, and starts players with the starter kit", async () => {
    const core = await Core.create(wasmModule);
    core.load([]);
    const me = core.join(key(7));
    expect(core.items(me)).toEqual(STARTER);
    for (const r of RECIPES) {
      const rich: [number, number][] = r.needs.map(([id, q]) => [id, q]);
      core.load([{ pk: key(7), items: rich.sort((a, b) => a[0] - b[0]) }]);
      expect(core.craft(0, r.id), ITEMS[r.product].name).toBe(0);
      expect(core.items(0)).toEqual([[r.product, 1]]);
      expect(core.craft(0, r.id), "nothing left").toBe(1);
    }
  });

  it("lets a host carry the gather cooldown across loads", async () => {
    const core = await Core.create(wasmModule);
    core.load([{ pk: key(1), items: [] }]);
    core.restoreTick(0, 10);
    expect(core.gather(0, 3, 10)).toBe(4);
    expect(core.gather(0, 3, 11)).toBe(0);
    expect(qtyOf(core.items(0), 3)).toBe(1);
  });
});
