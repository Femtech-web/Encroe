import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { playerLeaf, rootFromPath } from "../game/proof";
import {
  appId,
  bytesToHex,
  hexToBytes,
  nearBls,
  openKey,
  openPackage,
  releaseValid,
  sha256Hex,
  type Package,
} from "./release";

// A real release: encroe-life-52e4.testnet's epoch 2, which NEAR's MPC network released on chain (`4qATdQ1D…`).
const dir = path.join(__dirname, "../../../docs/results/escrow/life-52e4");
const c = JSON.parse(readFileSync(path.join(dir, "epoch-2/commitment.json"), "utf8"));
const released = JSON.parse(readFileSync(path.join(dir, "11-state-released.json"), "utf8")).released;
const sealed = new Uint8Array(readFileSync(path.join(dir, "epoch-2/package.sealed")));

const pk = nearBls(c.ckd_pk, "bls12381g2");
const sig = nearBls(released.big_c, "bls12381g1");

describe("opening a released escrow in the browser", () => {
  it("derives the contract's app id and accepts NEAR's release for it", () => {
    expect(bytesToHex(appId(c.predecessor, c.path))).toBe(c.app_id);
    expect(releaseValid(pk, hexToBytes(c.app_id), sig)).toBe(true);
    expect(releaseValid(pk, appId("someone-else.testnet", c.path), sig)).toBe(false);
  });

  it("recovers the key, decrypts the package and finds exactly what was committed", async () => {
    expect(sha256Hex(sealed)).toBe(c.pkg_sha256);
    const k = openKey(pk, hexToBytes(c.app_id), sig, hexToBytes(c.sealed_key.u), hexToBytes(c.sealed_key.v));
    const pkg = JSON.parse(new TextDecoder().decode(await openPackage(k, sealed, c.game, c.epoch))) as Package;
    expect(pkg.game).toBe(c.game);
    expect(sha256Hex(Uint8Array.from(atob(pkg.core_wasm_b64), (ch) => ch.charCodeAt(0)))).toBe(c.core_sha256);
    expect(pkg.players).toHaveLength(c.players);
    // Each player's leaf from the package rebuilds the committed root.
    const leaves = pkg.players.map((p) => playerLeaf(c.game, c.epoch, p.pk, p.items, p.salt));
    expect(leaves).toHaveLength(24);
    const demo = JSON.parse(readFileSync(path.join(dir, "epoch-2/players-private-demo.json"), "utf8"));
    expect(rootFromPath(leaves[5], demo[5].path)).toBe(c.root);
  });

  it("fails to open with a wrong release", async () => {
    const wrong = nearBls(released.big_y, "bls12381g1");
    const k = openKey(pk, hexToBytes(c.app_id), wrong, hexToBytes(c.sealed_key.u), hexToBytes(c.sealed_key.v));
    await expect(openPackage(k, sealed, c.game, c.epoch)).rejects.toThrow();
  });
});
