import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Core, type Seat } from "../game/core";
import type { Items } from "../game/items";

const CORES = {
  "Embergate (Rust)": "embergate.wasm",
  "Matchday (C++)": "matchday.wasm",
  "Neon City (C)": "neon-city.wasm",
};
const modules = Object.fromEntries(
  Object.entries(CORES).map(([name, file]) => [
    name,
    new WebAssembly.Module(readFileSync(path.join(__dirname, "../../public/core", file))),
  ]),
);
const key = (b: number) => new Uint8Array(32).fill(b);

/** The verifier's draw: SHA-256(seed ‖ label ‖ i) read as a little-endian u32. */
function draw(seed: string, label: string, i: number): number {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(i);
  return createHash("sha256").update(seed).update(label).update(n).digest().readUInt32LE(0);
}

function world(seed: string, players: number): Seat[] {
  return Array.from({ length: players }, (_, p) => {
    const kinds = new Set<number>();
    for (let i = 0; i < 1 + (draw(seed, `kinds${p}`, 0) % 12); i++) kinds.add(1 + (draw(seed, `id${p}`, i) % 40));
    const items: Items = [...kinds].sort((a, b) => a - b).map((id) => [id, 1 + (draw(seed, `q${p}`, id) % 9)]);
    return { pk: key(p + 1), items };
  });
}

const totals = (seats: Seat[]) => {
  const t: Record<number, number> = {};
  for (const s of seats) for (const [id, q] of s.items) t[id] = (t[id] ?? 0) + q;
  return t;
};

describe.each(Object.keys(CORES))("%s: the contract the Encroe verifier checks", (name) => {
  const wasmModule = modules[name];

  it("imports nothing and exports the sealed ABI", () => {
    expect(WebAssembly.Module.imports(wasmModule)).toEqual([]);
    const names = WebAssembly.Module.exports(wasmModule).map((e) => e.name);
    for (const f of ["memory", "input_ptr", "output_ptr", "load", "player_count", "get_key", "get_state", "trade"])
      expect(names, f).toContain(f);
  });

  it.each(["seed-a", "seed-b", "seed-c"])("serves every snapshot state exactly and conserves items (%s)", async (seed) => {
    const core = await Core.create(wasmModule);
    const seats = world(seed, 64);
    core.load(seats);
    expect(core.seats()).toEqual(seats);
    let applied = 0;
    for (let t = 0; t < 400; t++) {
      const from = draw(seed, "from", t) % 64;
      const to = draw(seed, "to", t) % 64;
      const code = core.trade(from, to, (draw(seed, "item", t) % 8) + 1, (draw(seed, "qty", t) % 3) + 1);
      expect([0, 1, 2, 3]).toContain(code);
      if (code === 0) applied++;
    }
    const after = core.seats();
    expect(applied).toBeGreaterThan(20);
    expect(totals(after)).toEqual(totals(seats));
    for (const s of after) {
      expect(s.items.every(([, q]) => q > 0)).toBe(true);
      expect(s.items.map(([id]) => id)).toEqual(s.items.map(([id]) => id).sort((a, b) => a - b));
      expect(s.items.length).toBeLessThanOrEqual(16);
    }
  });

  it("refuses a malformed snapshot", async () => {
    const core = await Core.create(wasmModule);
    expect(() => core.load(Array.from({ length: 65 }, (_, i) => ({ pk: key(i), items: [] })))).toThrow();
  });
});

describe("Matchday (C++): a football card club", () => {
  const COINS = 1,
    BRONZE = 2,
    GOLD = 4,
    FITNESS = 5;
  const qty = (core: Core, item: number) => core.items(0).find(([id]) => id === item)?.[1] ?? 0;
  const cards = (core: Core) => core.items(0).filter(([id]) => id >= 100);

  async function club() {
    const core = await Core.create(modules["Matchday (C++)"]);
    core.load([]);
    expect(core.join(key(9))).toBe(0);
    return core;
  }

  it("starts a club with coins, a bronze pack and fitness", async () => {
    const core = await club();
    expect(core.items(0)).toEqual([
      [COINS, 1000],
      [BRONZE, 1],
      [FITNESS, 3],
    ]);
  });

  it("opens a pack into three cards from its tier, once per tick", async () => {
    const core = await club();
    expect(core.call("open_pack", 0, BRONZE, 1)).toBe(0);
    expect(qty(core, BRONZE)).toBe(0);
    expect(cards(core).reduce((n, [, q]) => n + q, 0)).toBe(3);
    expect(cards(core).every(([id]) => id >= 100 && id < 112)).toBe(true);
    expect(core.call("buy_pack", 0, BRONZE)).toBe(0);
    expect(qty(core, COINS)).toBe(600);
    expect(core.call("open_pack", 0, BRONZE, 1)).toBe(4);
    expect(core.call("open_pack", 0, GOLD, 2)).toBe(1);
  });

  it("plays matches that cost fitness and pay by result, the same everywhere", async () => {
    const a = await club();
    const b = await club();
    for (const core of [a, b]) {
      core.call("open_pack", 0, BRONZE, 1);
      expect(core.call("play_match", 0, 2)).toBe(0);
    }
    const [result, squad, opponent, coins] = a.out(4);
    expect(b.out(4)).toEqual([result, squad, opponent, coins]);
    expect(result).toBeLessThanOrEqual(2);
    expect(opponent).toBeGreaterThanOrEqual(58);
    expect(opponent).toBeLessThanOrEqual(89);
    expect(coins).toBe(result === 2 ? 300 + (opponent - 58) * 20 : result === 1 ? 100 : 0);
    expect(qty(a, FITNESS)).toBe(2);
    expect(qty(a, COINS)).toBe(1000 + coins);
  });

  it("quick-sells a card for ten coins per rating point", async () => {
    const core = await club();
    core.call("open_pack", 0, BRONZE, 1);
    const [card] = cards(core)[0];
    const before = qty(core, COINS);
    expect(core.call("quick_sell", 0, card)).toBe(0);
    expect(qty(core, COINS) - before).toBeGreaterThanOrEqual(550);
    expect(core.call("quick_sell", 0, 99)).toBe(5);
  });
});

describe("Neon City (C): a city economy", () => {
  const CASH = 1,
    FUEL = 2,
    RESPECT = 4,
    SCOOTER = 20,
    TAXI = 21;
  const qty = (core: Core, item: number) => core.items(0).find(([id]) => id === item)?.[1] ?? 0;

  async function player() {
    const core = await Core.create(modules["Neon City (C)"]);
    core.load([]);
    expect(core.join(key(7))).toBe(0);
    return core;
  }

  it("arrives with cash, fuel and a scooter", async () => {
    const core = await player();
    expect(core.items(0)).toEqual([
      [CASH, 50],
      [FUEL, 5],
      [SCOOTER, 1],
    ]);
  });

  it("works a delivery once per tick: fuel in, cash and respect out", async () => {
    const core = await player();
    expect(core.call("job", 0, 1, 1)).toBe(0);
    expect(core.out(3)).toEqual([1, 8, 1]);
    expect([qty(core, CASH), qty(core, FUEL), qty(core, RESPECT)]).toEqual([58, 4, 1]);
    expect(core.call("job", 0, 1, 1)).toBe(4);
    expect(core.call("job", 0, 2, 2)).toBe(1);
    expect(core.call("job", 0, 9, 2)).toBe(5);
  });

  it("buys from the city and sells vehicles back at half", async () => {
    const core = await player();
    expect(core.call("buy", 0, TAXI)).toBe(1);
    expect(core.call("buy", 0, FUEL)).toBe(0);
    expect(core.call("sell", 0, SCOOTER)).toBe(0);
    expect([qty(core, CASH), qty(core, FUEL), qty(core, SCOOTER)]).toEqual([59, 6, 0]);
    expect(core.call("sell", 0, FUEL)).toBe(5);
    expect(core.call("collect", 0, 3)).toBe(1);
  });

  it("keeps heists for players with respect", async () => {
    const core = await player();
    core.load([{ pk: key(7), items: [[CASH, 900], [FUEL, 9], [3, 9], [23, 1]] }]);
    expect(core.call("job", 0, 4, 1)).toBe(1);
  });
});

describe("the catalog of revivable games", () => {
  it("names each core by the hash of the very bytes the site serves", async () => {
    const { CATALOGS } = await import("./catalog");
    const served = Object.values(CORES).map((file) =>
      createHash("sha256")
        .update(readFileSync(path.join(__dirname, "../../public/core", file)))
        .digest("hex"),
    );
    expect(Object.keys(CATALOGS).sort()).toEqual(served.sort());
  });
});
