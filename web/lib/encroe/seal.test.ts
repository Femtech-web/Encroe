import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bls12_381 as bls } from "@noble/curves/bls12-381.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { base58Encode } from "../chain/tx";
import { merkleRoot, rootFromPath } from "../game/proof";
import { appId, hashPoint, openKey, openPackage, releaseValid, sha256Hex, type Package } from "./release";
import { openOutlayerSecret, outlayerSecret, sealEpoch } from "./seal";

// A stand-in for NEAR's MPC network: a master key we hold, so the test can make the release it would make.
const msk = bls.fields.Fr.create(0x1234567890abcdefn);
const pk = bls.G2.Point.BASE.multiply(msk).toBytes(true);
const CKD_PK = `bls12381g2:${base58Encode(pk)}`;
const ESCROW = "matchday.encroe.testnet";
const PATH = "encroe/matchday/1";
const core = new Uint8Array(readFileSync(path.join(__dirname, "../../public/core/matchday.wasm")));
const world = [
  {
    pk: "bb".repeat(32),
    items: [
      [1, 900],
      [104, 1],
      [5, 0],
    ] as [number, number][],
  },
  {
    pk: "aa".repeat(32),
    items: [
      [2, 1],
      [1, 1000],
    ] as [number, number][],
  },
  { pk: "cc".repeat(32), items: [[6, 2]] as [number, number][] },
];
const release = () => hashPoint(pk, appId(ESCROW, PATH)).multiply(msk).toBytes(true);
const CLI = path.join(__dirname, "../../../target/release/encore");

describe("sealing an epoch in the browser", () => {
  it("seals what the code that opens real releases can open, exactly as committed", async () => {
    const s = await sealEpoch({ escrow: ESCROW, path: PATH, game: "matchday", epoch: 2, ckdPk: CKD_PK, core, world });
    const c = s.commitment;
    expect(c.app_id).toBe(bytesToHex(appId(ESCROW, PATH)));
    expect(c.pkg_sha256).toBe(sha256Hex(s.sealed));
    expect(c.core_sha256).toBe(sha256Hex(core));
    expect(c.players).toBe(3);

    const sig = release();
    expect(releaseValid(pk, hexToBytes(c.app_id), sig)).toBe(true);
    const k = openKey(pk, hexToBytes(c.app_id), sig, hexToBytes(c.sealed_u), hexToBytes(c.sealed_v));
    expect(bytesToHex(k)).toBe(bytesToHex(s.secret.k));
    const pkg = JSON.parse(new TextDecoder().decode(await openPackage(k, s.sealed, "matchday", 2))) as Package;

    // Players sorted by key, zero quantities dropped, items ascending; every leaf's path reaches the root.
    expect(pkg.players.map((p) => p.pk)).toEqual(["aa".repeat(32), "bb".repeat(32), "cc".repeat(32)]);
    expect(pkg.players[1].items).toEqual([
      [1, 900],
      [104, 1],
    ]);
    expect(merkleRoot(s.proofs.map((p) => p.leaf))).toBe(c.root);
    for (const p of s.proofs) expect(rootFromPath(p.leaf, p.path)).toBe(c.root);
  });

  it("refuses an empty world and an overfull player", async () => {
    await expect(
      sealEpoch({ escrow: ESCROW, path: PATH, game: "m", epoch: 1, ckdPk: CKD_PK, core, world: [] }),
    ).rejects.toThrow("1 to 64");
    const greedy = [
      { pk: "aa".repeat(32), items: Array.from({ length: 17 }, (_, i) => [i + 1, 1] as [number, number]) },
    ];
    await expect(
      sealEpoch({ escrow: ESCROW, path: PATH, game: "m", epoch: 1, ckdPk: CKD_PK, core, world: greedy }),
    ).rejects.toThrow("16 kinds");
  });

  it("writes the key row OutLayer's keystore reads", () => {
    const keystore = x25519.utils.randomSecretKey();
    const k = new Uint8Array(32).fill(7);
    const r = new Uint8Array(32).fill(9);
    const blob = outlayerSecret(bytesToHex(x25519.getPublicKey(keystore)), k, r);
    expect(openOutlayerSecret(keystore, blob)).toEqual({ ENCORE_K: bytesToHex(k), ENCORE_R: bytesToHex(r) });
  });

  it.skipIf(!existsSync(CLI))(
    "is the Rust sealer's twin: `encore open` opens it, and its secret blobs open here",
    async () => {
      const s = await sealEpoch({ escrow: ESCROW, path: PATH, game: "matchday", epoch: 2, ckdPk: CKD_PK, core, world });
      const dir = mkdtempSync(path.join(tmpdir(), "encroe-seal-"));
      const c = s.commitment;
      writeFileSync(
        path.join(dir, "commitment.json"),
        JSON.stringify({
          v: 1,
          game: c.game,
          epoch: c.epoch,
          predecessor: ESCROW,
          path: PATH,
          domain_id: 2,
          ckd_pk: c.ckd_pk,
          app_id: c.app_id,
          sealed_key: { u: c.sealed_u, v: c.sealed_v },
          pkg_sha256: c.pkg_sha256,
          root: c.root,
          core_sha256: c.core_sha256,
          players: c.players,
        }),
      );
      writeFileSync(path.join(dir, "package.sealed"), s.sealed);
      const opened = spawnSync(CLI, [
        "open",
        "--commitment",
        path.join(dir, "commitment.json"),
        "--package",
        path.join(dir, "package.sealed"),
        "--sig",
        bytesToHex(release()),
      ]);
      expect(opened.status, opened.stderr.toString()).toBe(0);

      const keystore = x25519.utils.randomSecretKey();
      writeFileSync(
        path.join(dir, "secret.json"),
        JSON.stringify({ k: bytesToHex(s.secret.k), r: bytesToHex(s.secret.r) }),
      );
      const blob = spawnSync(CLI, [
        "outlayer-secret",
        "--pubkey",
        bytesToHex(x25519.getPublicKey(keystore)),
        "--secret",
        path.join(dir, "secret.json"),
      ]);
      expect(blob.status, blob.stderr.toString()).toBe(0);
      expect(openOutlayerSecret(keystore, blob.stdout.toString().trim())).toEqual({
        ENCORE_K: bytesToHex(s.secret.k),
        ENCORE_R: bytesToHex(s.secret.r),
      });
    },
  );
});
