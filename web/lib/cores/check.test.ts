import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCore } from "./check";

const core = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../public/core", f)));

describe("the core checker on /tools", () => {
  it.each(["embergate.wasm", "matchday.wasm", "neon-city.wasm"])("passes %s, a core we sealed", async (f) => {
    const r = await checkCore(core(f));
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.moves).toContain("join");
  });

  it("fails a core that imports anything, before running it", async () => {
    const importing = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 2, 9, 1, 3, 101, 110, 118, 1, 102, 0, 0,
    ]);
    const r = await checkCore(importing);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "imports")).toMatchObject({ ok: false, detail: "imports env.f" });
  });

  it("refuses something that is not WebAssembly", async () => {
    const r = await checkCore(new TextEncoder().encode("not a core"));
    expect(r.checks[0]).toMatchObject({ id: "wasm", ok: false });
  });
});
