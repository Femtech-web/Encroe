import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Opening a released escrow, in the browser: the rules of crates/encore-crypto (ckd.rs, ibe.rs, package.rs), so
 * anyone can turn NEAR's public release into the sealed game without our tools. release.test.ts checks them
 * against a real released epoch.
 */

const APP_ID_PREFIX = "near-mpc v0.1.0 app_id derivation:";
const NEAR_CKD_DST = "NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_";
const IBE_SALT = utf8ToBytes("encore-ibe-v1");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const d = B58.indexOf(c);
    if (d < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(d);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const zeros = s.length - s.replace(/^1+/, "").length;
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

/** NEAR's `bls12381g1:<base58>` / `bls12381g2:<base58>` strings. */
export function nearBls(s: string, prefix: "bls12381g1" | "bls12381g2"): Uint8Array {
  const [p, data] = s.split(":");
  if (p !== prefix || !data) throw new Error(`expected ${prefix}:<base58>`);
  const bytes = base58Decode(data);
  if (bytes.length !== (prefix === "bls12381g1" ? 48 : 96)) throw new Error(`bad ${prefix} length`);
  return bytes;
}

/** The MPC network's app id for a contract and path: whose key this is. */
export function appId(predecessor: string, path: string): Uint8Array {
  return sha3_256(utf8ToBytes(`${APP_ID_PREFIX}${predecessor},${path}`));
}

export function hashPoint(pk: Uint8Array, app: Uint8Array) {
  return bls.G1.hashToCurve(concatBytes(pk, app), { DST: NEAR_CKD_DST });
}

/** The release is the MPC network's BLS signature on this identity: `e(sig, g2) == e(H(pk || app_id), pk)`. */
export function releaseValid(pk: Uint8Array, app: Uint8Array, sig: Uint8Array): boolean {
  const s = bls.G1.Point.fromBytes(sig);
  if (s.is0()) return false;
  const lhs = bls.pairing(s, bls.G2.Point.BASE);
  const rhs = bls.pairing(hashPoint(pk, app), bls.G2.Point.fromBytes(pk));
  return bls.fields.Fp12.eql(lhs, rhs);
}

type Fp2 = { c0: bigint; c1: bigint };
export type Fp12 = { c0: { c0: Fp2; c1: Fp2; c2: Fp2 }; c1: { c0: Fp2; c1: Fp2; c2: Fp2 } };

/** arkworks' uncompressed encoding of a pairing output: twelve 48-byte little-endian field elements, c0 first. */
export function gtBytes(gt: Fp12): Uint8Array {
  const out = new Uint8Array(576);
  let at = 0;
  for (const six of [gt.c0, gt.c1])
    for (const two of [six.c0, six.c1, six.c2])
      for (let x of [two.c0, two.c1]) {
        for (let i = 0; i < 48; i++, x >>= 8n) out[at + i] = Number(x & 0xffn);
        at += 48;
      }
  return out;
}

/** Recovers the package key from the release: `k = v XOR HKDF(e(sig, U), U || H(pk || app_id))`. */
export function openKey(pk: Uint8Array, app: Uint8Array, sig: Uint8Array, u: Uint8Array, v: Uint8Array): Uint8Array {
  const q = hashPoint(pk, app);
  const gt = bls.pairing(bls.G1.Point.fromBytes(sig), bls.G2.Point.fromBytes(u)) as unknown as Fp12;
  const mask = hkdf(sha256, gtBytes(gt), IBE_SALT, concatBytes(u, q.toBytes(true)), 32);
  return v.map((b, i) => b ^ mask[i]);
}

/** `nonce(12) || AES-256-GCM(k, package, "encore-pkg-v1|<game>|<epoch>")`; throws if the key or bytes are wrong. */
export async function openPackage(k: Uint8Array, sealed: Uint8Array, game: string, epoch: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", k as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.slice(0, 12), additionalData: utf8ToBytes(`encore-pkg-v1|${game}|${epoch}`) },
    key,
    sealed.slice(12),
  );
  return new Uint8Array(plain);
}

export type PackagePlayer = { pk: string; items: [number, number][]; salt: string };
export type Package = { v: number; game: string; epoch: number; core_wasm_b64: string; players: PackagePlayer[] };

export const sha256Hex = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export { bytesToHex, hexToBytes };
