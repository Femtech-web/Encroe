import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newSecretKey, publicKeyOf } from "./moves";
import { local } from "./transport";
import { EMPTY_WORLD } from "./world";

const wasmModule = new WebAssembly.Module(readFileSync(path.join(__dirname, "../../public/core/embergate.wasm")));

describe("a revived world, hosted by the browser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plays signed moves on the sealed core without calling any server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const t = local("encroe-test.testnet", 1, EMPTY_WORLD, wasmModule, "49ff0c57");
    const sk = newSecretKey();
    expect(await t.me(publicKeyOf(sk))).toBeNull();

    const joined = await t.move(sk, { kind: "join", name: "Judge" });
    expect(joined.items).toEqual([
      [1, 3],
      [2, 2],
    ]);
    const forged = await t.move(sk, { kind: "forge", recipe: 1 });
    expect(forged.items).toEqual([
      [1, 1],
      [2, 1],
      [9, 1],
    ]);
    await expect(t.move(sk, { kind: "forge", recipe: 1 })).rejects.toThrow("not enough items");
    expect((await t.world()).players).toBe(1);
    expect(t.revived).toEqual({ escrow: "encroe-test.testnet", epoch: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
