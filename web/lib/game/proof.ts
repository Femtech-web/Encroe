import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Items } from "./items";

/**
 * The player-leaf and Merkle rules of crates/encore-crypto/src/game.rs, so a browser checks its own items are in
 * the root NEAR holds without trusting this site.
 */

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

const u64 = (n: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};

/** `n:u32le || (id:u32le, qty:u32le)*`, ids ascending, zero quantities dropped. */
export function stateBytes(items: Items): Uint8Array {
  const sorted = items.filter(([, q]) => q > 0).sort((a, b) => a[0] - b[0]);
  return concatBytes(u32(sorted.length), ...sorted.flatMap(([id, q]) => [u32(id), u32(q)]));
}

export function playerLeaf(game: string, epoch: number, pk: string, items: Items, salt: string): string {
  const name = utf8ToBytes(game);
  const preimage = concatBytes(
    new Uint8Array([0]),
    utf8ToBytes("encore-leaf-v1"),
    u32(name.length),
    name,
    u64(epoch),
    hexToBytes(pk),
    sha256(stateBytes(items)),
    hexToBytes(salt),
  );
  return bytesToHex(sha256(preimage));
}

/** Sibling hashes bottom-up; `true` when the sibling is on the right. */
export function rootFromPath(leaf: string, path: [string, boolean][]): string {
  let acc = hexToBytes(leaf);
  for (const [sib, right] of path) {
    const s = hexToBytes(sib);
    acc = sha256(concatBytes(new Uint8Array([1]), right ? acc : s, right ? s : acc));
  }
  return bytesToHex(acc);
}

const node = (l: Uint8Array, r: Uint8Array) => sha256(concatBytes(new Uint8Array([1]), l, r));

/** The root over every leaf, an odd last node paired with itself (game.rs `merkle_root`). */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "00".repeat(32);
  let level = leaves.map(hexToBytes);
  while (level.length > 1)
    level = Array.from({ length: Math.ceil(level.length / 2) }, (_, i) =>
      node(level[2 * i], level[2 * i + 1] ?? level[2 * i]),
    );
  return bytesToHex(level[0]);
}
