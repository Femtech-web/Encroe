import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberBE } from "@noble/curves/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { merklePath, merkleRoot, playerLeaf } from "../game/proof";
import { appId, gtBytes, hashPoint, nearBls, type Fp12 } from "./release";

/**
 * Sealing an epoch, in the browser: the rules of crates/encore-crypto (ibe.rs `seal_key`, package.rs `seal_bytes`,
 * game.rs leaves) and of the CLI's `outlayer-secret`, so a studio seals its world without our tools. seal.test.ts
 * opens what this seals with the code that opens real releases, and decrypts the CLI's own secret blobs.
 */

const IBE_SALT = utf8ToBytes("encore-ibe-v1");
const PACKAGE_VERSION = 1;

export type WorldPlayer = { pk: string; items: [number, number][] };
export type ProofEntry = {
  index: number;
  pk: string;
  items: [number, number][];
  salt: string;
  leaf: string;
  path: [string, boolean][];
};

/** Exactly the arguments the escrow's `commit` takes. */
export type Commitment = {
  game: string;
  epoch: number;
  ckd_pk: string;
  app_id: string;
  sealed_u: string;
  sealed_v: string;
  pkg_sha256: string;
  root: string;
  core_sha256: string;
  players: number;
};

/** `U = r·G2`, `V = k XOR HKDF(e(r·Q, pk), U ‖ Q)`, with `Q = H(pk ‖ app_id)`: only the release (`msk·Q`) opens it. */
export function sealKey(
  pk: Uint8Array,
  app: Uint8Array,
  k: Uint8Array,
  rBytes: Uint8Array,
): { u: Uint8Array; v: Uint8Array } {
  const r = bls.fields.Fr.create(bytesToNumberBE(rBytes));
  if (r === 0n) throw new Error("zero scalar");
  const q = hashPoint(pk, app);
  const u = bls.G2.Point.BASE.multiply(r).toBytes(true);
  const gt = bls.pairing(q.multiply(r), bls.G2.Point.fromBytes(pk)) as unknown as Fp12;
  const mask = hkdf(sha256, gtBytes(gt), IBE_SALT, concatBytes(u, q.toBytes(true)), 32);
  return { u, v: k.map((b, i) => b ^ mask[i]) };
}

/** `nonce(12) || AES-256-GCM(k, package, "encore-pkg-v1|<game>|<epoch>")`. */
export async function sealBytes(
  k: Uint8Array,
  nonce: Uint8Array,
  plain: Uint8Array,
  game: string,
  epoch: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", k as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource, additionalData: utf8ToBytes(`encore-pkg-v1|${game}|${epoch}`) },
    key,
    plain as BufferSource,
  );
  return concatBytes(nonce, new Uint8Array(ct));
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export type Sealed = {
  commitment: Commitment;
  sealed: Uint8Array;
  packageB64: string;
  /** Each player's salt and path: theirs alone until the release. */
  proofs: ProofEntry[];
  /** The package key and the IBE randomness: either opens the package, so they go only to OutLayer's keystore. */
  secret: { k: Uint8Array; r: Uint8Array };
};

/**
 * Seals one epoch for an escrow: the core and every player's items with a fresh salt each (players sorted by key,
 * items ascending, as the CLI does), encrypted to the key NEAR's MPC network derives for the escrow's identity.
 */
export async function sealEpoch(input: {
  escrow: string;
  path: string;
  game: string;
  epoch: number;
  ckdPk: string;
  core: Uint8Array;
  world: WorldPlayer[];
  random?: (n: number) => Uint8Array;
}): Promise<Sealed> {
  const random = input.random ?? randomBytes;
  if (input.world.length < 1 || input.world.length > 64) throw new Error("a world has 1 to 64 players");
  const players = input.world
    .map((p) => ({
      pk: p.pk,
      items: p.items.filter(([, q]) => q > 0).sort((a, b) => a[0] - b[0]) as [number, number][],
      salt: bytesToHex(random(32)),
    }))
    .sort((a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0));
  if (players.some((p) => p.items.length > 16)) throw new Error("a player holds at most 16 kinds of item");

  const pk = nearBls(input.ckdPk, "bls12381g2");
  const app = appId(input.escrow, input.path);
  const k = random(32);
  const r = random(32);
  const { u, v } = sealKey(pk, app, k, r);
  const pkg = { v: PACKAGE_VERSION, game: input.game, epoch: input.epoch, core_wasm_b64: b64(input.core), players };
  const sealed = await sealBytes(k, random(12), utf8ToBytes(JSON.stringify(pkg)), input.game, input.epoch);
  const leaves = players.map((p) => playerLeaf(input.game, input.epoch, p.pk, p.items, p.salt));
  return {
    commitment: {
      game: input.game,
      epoch: input.epoch,
      ckd_pk: input.ckdPk,
      app_id: bytesToHex(app),
      sealed_u: bytesToHex(u),
      sealed_v: bytesToHex(v),
      pkg_sha256: bytesToHex(sha256(sealed)),
      root: merkleRoot(leaves),
      core_sha256: bytesToHex(sha256(input.core)),
      players: players.length,
    },
    sealed,
    packageB64: b64(sealed),
    proofs: players.map((p, index) => ({ index, ...p, leaf: leaves[index], path: merklePath(leaves, index) })),
    secret: { k, r },
  };
}

/**
 * The epoch's key row for OutLayer's keystore, as the CLI's `outlayer-secret` writes it: X25519 with an ephemeral
 * key, HKDF-SHA256 ("outlayer-keystore-v1"), ChaCha20-Poly1305; `0x01 ‖ ephemeral public ‖ nonce ‖ ciphertext`.
 */
export function outlayerSecret(recipientHex: string, k: Uint8Array, r: Uint8Array, random = randomBytes): string {
  const eph = random(32);
  const shared = x25519.getSharedSecret(eph, hexToBytes(recipientHex));
  const key = hkdf(sha256, shared, undefined, utf8ToBytes("outlayer-keystore-v1"), 32);
  const nonce = random(12);
  const plain = utf8ToBytes(JSON.stringify({ ENCORE_K: bytesToHex(k), ENCORE_R: bytesToHex(r) }));
  const ct = chacha20poly1305(key, nonce).encrypt(plain);
  return b64(concatBytes(new Uint8Array([1]), x25519.getPublicKey(eph), nonce, ct));
}

/** What the keystore does with the blob (for tests and for anyone checking a blob they made). */
export function openOutlayerSecret(
  recipientSecret: Uint8Array,
  blobB64: string,
): { ENCORE_K: string; ENCORE_R: string } {
  const blob = Uint8Array.from(atob(blobB64), (c) => c.charCodeAt(0));
  if (blob[0] !== 1) throw new Error("unknown version");
  const shared = x25519.getSharedSecret(recipientSecret, blob.subarray(1, 33));
  const key = hkdf(sha256, shared, undefined, utf8ToBytes("outlayer-keystore-v1"), 32);
  const plain = chacha20poly1305(key, blob.subarray(33, 45)).decrypt(blob.subarray(45));
  return JSON.parse(new TextDecoder().decode(plain));
}
