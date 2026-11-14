import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { claimFor, claimMessage } from "../encroe/items";
import type { PackagePlayer } from "../encroe/release";
import type { Items } from "./items";
import { merklePath, merkleRoot, playerLeaf, rootFromPath } from "./proof";

/**
 * Properties of the formats every escrow commits to, over many generated worlds. The generator is seeded, so a
 * failure names the seed that reproduces it.
 */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}
const int = (r: () => number, n: number) => Math.floor(r() * n);
const bytes = (r: () => number, n: number) => Uint8Array.from({ length: n }, () => int(r, 256));

function world(seed: number): { game: string; epoch: number; players: PackagePlayer[] } {
  const r = rng(seed);
  const players = Array.from({ length: 1 + int(r, 64) }, () => {
    const ids = [...new Set(Array.from({ length: int(r, 17) }, () => 1 + int(r, 200)))].slice(0, 16);
    const items: Items = ids.sort((a, b) => a - b).map((id) => [id, 1 + int(r, 5000)]);
    return { pk: bytesToHex(bytes(r, 32)), items, salt: bytesToHex(bytes(r, 32)) };
  });
  players.sort((a, b) => (a.pk < b.pk ? -1 : 1));
  return { game: ["embergate", "matchday", "starhaul"][int(r, 3)], epoch: 1 + int(r, 1000), players };
}

const SEEDS = Array.from({ length: 60 }, (_, i) => 0x5eed + i * 7919);

describe("the committed formats, over generated worlds", () => {
  it.each(SEEDS)("every player's path reaches the root, and only their own leaf does (seed %i)", (seed) => {
    const { game, epoch, players } = world(seed);
    const leaves = players.map((p) => playerLeaf(game, epoch, p.pk, p.items, p.salt));
    const root = merkleRoot(leaves);
    leaves.forEach((leaf, i) => {
      const path = merklePath(leaves, i);
      expect(rootFromPath(leaf, path)).toBe(root);
      const other = leaves[(i + 1) % leaves.length];
      if (other !== leaf) expect(rootFromPath(other, path)).not.toBe(root);
    });
  });

  it.each(SEEDS.slice(0, 20))("any change to one player's items or salt changes the root (seed %i)", (seed) => {
    const { game, epoch, players } = world(seed);
    const leaves = players.map((p) => playerLeaf(game, epoch, p.pk, p.items, p.salt));
    const root = merkleRoot(leaves);
    const r = rng(seed ^ 0xabc);
    const i = int(r, players.length);
    const p = players[i];
    const more: Items = p.items.length ? p.items.map(([id, q], j) => [id, j === 0 ? q + 1 : q]) : [[1, 1]];
    const changed = [
      playerLeaf(game, epoch, p.pk, more, p.salt),
      playerLeaf(game, epoch, p.pk, p.items, bytesToHex(bytes(r, 32))),
      playerLeaf(game, epoch + 1, p.pk, p.items, p.salt),
      playerLeaf(`${game}x`, epoch, p.pk, p.items, p.salt),
    ];
    for (const leaf of changed) expect(merkleRoot(leaves.map((l, j) => (j === i ? leaf : l)))).not.toBe(root);
  });

  it.each(SEEDS.slice(0, 20))("a player's leaf ignores item order and zero quantities (seed %i)", (seed) => {
    const { game, epoch, players } = world(seed);
    const r = rng(seed ^ 0x123);
    for (const p of players) {
      const shuffled = [...p.items, [999_999, 0] as [number, number]].sort(() => r() - 0.5);
      expect(playerLeaf(game, epoch, p.pk, shuffled, p.salt)).toBe(playerLeaf(game, epoch, p.pk, p.items, p.salt));
    }
  });

  it.each(SEEDS.slice(0, 10))("an item claim proves the player's own leaf, signed by their key (seed %i)", (seed) => {
    const { game, epoch, players } = world(seed);
    const r = rng(seed ^ 0x777);
    const sk = bytes(r, 32);
    const pk = bytesToHex(ed25519.getPublicKey(sk));
    const me: PackagePlayer = { pk, items: [[3, 7]], salt: bytesToHex(bytes(r, 32)) };
    const all = [...players.slice(0, 63), me].sort((a, b) => (a.pk < b.pk ? -1 : 1));
    const root = merkleRoot(all.map((p) => playerLeaf(game, epoch, p.pk, p.items, p.salt)));
    const to = `0x${bytesToHex(bytes(r, 20))}`;
    const claim = claimFor("x.encroe.testnet", game, epoch, all, pk, sk, to)!;
    expect(rootFromPath(playerLeaf(game, epoch, claim.player, claim.items, claim.salt), claim.path)).toBe(root);
    expect(
      ed25519.verify(hexToBytes(claim.signature), utf8ToBytes(claimMessage("x.encroe.testnet", to)), hexToBytes(pk)),
    ).toBe(true);
    expect(
      claimFor(
        "x.encroe.testnet",
        game,
        epoch,
        all.filter((p) => p.pk !== pk),
        pk,
        sk,
        to,
      ),
    ).toBeNull();
  });
});
