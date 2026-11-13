import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { playerLeaf, rootFromPath } from "./proof";

// A real sealed epoch: encroe-life-52e4.testnet committed this root on chain (epoch 2, released, so its
// generated players' salts are public).
const dir = path.join(__dirname, "../../../docs/results/escrow/life-52e4/epoch-2");
const commitment = JSON.parse(readFileSync(path.join(dir, "commitment.json"), "utf8"));
const players = JSON.parse(readFileSync(path.join(dir, "players-private-demo.json"), "utf8"));

describe("a player's inclusion proof, checked in the browser", () => {
  it("rebuilds every leaf and the on-chain root exactly as the Rust sealer did", () => {
    expect(players).toHaveLength(24);
    for (const p of players) {
      const leaf = playerLeaf(commitment.game, commitment.epoch, p.pk, p.items, p.salt);
      expect(leaf).toBe(p.leaf);
      expect(rootFromPath(leaf, p.path)).toBe(commitment.root);
    }
  });

  it("fails for a changed item count, a wrong salt or a wrong epoch", () => {
    const p = players[3];
    const more = p.items.map(([id, q]: [number, number], i: number) => [id, i === 0 ? q + 1 : q]);
    expect(rootFromPath(playerLeaf(commitment.game, commitment.epoch, p.pk, more, p.salt), p.path)).not.toBe(
      commitment.root,
    );
    expect(
      rootFromPath(playerLeaf(commitment.game, commitment.epoch, p.pk, p.items, "00".repeat(32)), p.path),
    ).not.toBe(commitment.root);
    expect(rootFromPath(playerLeaf(commitment.game, 1, p.pk, p.items, p.salt), p.path)).not.toBe(commitment.root);
  });
});
