# Cryptography and formats

Every byte Encroe commits, encrypts, signs or checks, exactly. Each format has two implementations that are tested
against each other (Rust and the browser, or NEAR and the EVM); the "Held by" column names the test.

## 1. The escrow's key: NEAR's confidential key derivation, used as identity-based encryption

| | Definition |
|---|---|
| MPC key | `pk`: the public key of `v1.signer-prod.testnet`'s domain 2 (BLS12-381, G2, 96 bytes compressed), from `public_key {"domain_id": 2}`, written `bls12381g2:<base58>` |
| Identity | `app_id = SHA3-256("near-mpc v0.1.0 app_id derivation:" ‖ escrow ‖ "," ‖ path)`; `path` is `encroe/<name>/1` for a factory escrow |
| Point | `Q = hash_to_curve_G1(pk ‖ app_id)`, DST `NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_` |
| Release | `sig = msk·Q` (G1). The escrow asks with `AppPublicKeyPV{identity, identity}`, so the response's `big_c` is `sig` itself: public by construction |
| Check | `e(sig, g2) = e(Q, pk)` |

Held by: `crates/encore-crypto/tests/ckd_vectors.rs` (near/mpc's own vectors), `web/lib/encroe/release.test.ts` (a real
release).

## 2. Sealing the package key

| | Definition |
|---|---|
| Key | `k`: 32 random bytes (AES-256) |
| Seal | random scalar `r`; `U = r·G2`; `mask = HKDF-SHA256(salt "encore-ibe-v1", ikm = GT(e(r·Q, pk)), info = U ‖ Q, 32)`; `V = k ⊕ mask` |
| Open | `GT(e(sig, U))` equals `GT(e(r·Q, pk))`, so the same HKDF gives `mask` and `k = V ⊕ mask` |
| GT bytes | arkworks' uncompressed encoding: twelve 48-byte little-endian Fp elements, in the order c0.c0.c0, c0.c0.c1, c0.c1.c0, … c1.c2.c1 |
| Committed as | `sealed_u` = U (96 bytes, hex), `sealed_v` = V (32 bytes, hex) |

Held by: `crates/encore-crypto` (ibe), `web/lib/encroe/seal.test.ts` (the browser seals, the CLI opens).

## 3. The sealed package

`package = nonce(12) ‖ AES-256-GCM(k, json, aad = "encore-pkg-v1|<game>|<epoch>")`, where `json` is

```json
{ "v": 1, "game": "<game>", "epoch": 1, "core_wasm_b64": "<the server core>",
  "players": [{ "pk": "<64 hex>", "items": [[1, 4], [9, 1]], "salt": "<64 hex>" }] }
```

Players sorted by `pk`; each player's items with ids ascending and no zero quantities; at most 64 players and 16 kinds
of item each. `pkg_sha256 = SHA-256(package)`. On FastFS it lives at
`https://test.fastfs.io/<uploader>/<escrow>/<pkg_sha256>.sealed`; the hash, not the host, decides it.

## 4. A player's leaf, and the root

| | Definition |
|---|---|
| State | `n:u32 ‖ (id:u32, qty:u32)*`, little-endian, ids ascending, no zero quantities |
| Leaf | `SHA-256(0x00 ‖ "encore-leaf-v1" ‖ u32(len game) ‖ game ‖ u64(epoch) ‖ pk ‖ SHA-256(state) ‖ salt)`, integers little-endian |
| Node | `SHA-256(0x01 ‖ left ‖ right)`; an odd last node is paired with itself |
| Path | `[(sibling, sibling_is_right)]` from the leaf up |

Held by: `web/lib/game/proof.test.ts` (on-chain roots), `contracts/encroe-items` `leaf_and_root_are_the_sites`, and the
property tests in `web/lib/game/proof.property.test.ts`.

## 5. The commitment

`commit` stores `{game, epoch, ckd_pk, app_id, sealed_u, sealed_v, pkg_sha256, root, core_sha256, players}`. Hashes are
32-byte hex; `sealed_u` is 96 bytes; epochs only rise.

## 6. The epoch's key row for OutLayer's keystore

`blob = 0x01 ‖ eph_pub(32) ‖ nonce(12) ‖ ChaCha20-Poly1305(key, nonce, {"ENCORE_K": hex k, "ENCORE_R": hex r})`, where
`key = HKDF-SHA256(no salt, ikm = X25519(eph, keystore_pub), info "outlayer-keystore-v1", 32)` and `keystore_pub` comes
from OutLayer for (the pinned verifier's wasm hash, the studio, profile `<secret_profile>-<epoch>`). Stored with access
`WasmHash(9c0eb2e7…) AND Predecessor ∈ {escrow}`.

Held by: `web/lib/encroe/seal.test.ts` (the CLI's blobs open in the browser, and the browser's open as the keystore does).

## 7. A verification run, bound to NEAR

The escrow sends OutLayer `input = {v, game, epoch, predecessor, path, domain_id, ckd_pk, app_id, sealed_u, sealed_v,
pkg_b64, pkg_sha256, root, core_sha256, seed}` and records `SHA-256(input)`. The verifier's output must say `pass`, the
same `pkg_sha256`, `root`, `core_sha256` and `seed`, and `mode: "secret"`. `prove_run` then requires the attestation to
be an `execute` task of build target `wasm32-wasip2`, the pinned wasm hash, this run's input and output hashes, this
run's caller and secret row; NEAR's DCAP verifier must accept the TDX quote whose report data is the attestation's task
hash (SHA-256 over its fields in order), and its measurements must be in OutLayer's approved list.

Held by: `contracts/encroe-escrow` tests (real DCAP bytes), `crates/encore-attest`.

## 8. A move

Signed text: `encroe/<game>/v1|<pk>|<nonce>|<kind>|<args…>` (ed25519, the player's browser key). The nonce is a
millisecond timestamp: fresh within a window, and above the player's last.

Held by: `web/lib/game/world.test.ts`.

## 9. An item claim

| | Definition |
|---|---|
| Player's signature | ed25519 over `encroe-claim-v1|<escrow>|<to, lowercase 0x hex>` |
| EIP-712 domain | `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)` = ("Encroe Items", "1", 84532, `0x94365D73…a2e1`) |
| Struct | `Claim(bytes32 escrow,uint64 epoch,bytes32 player,address to,bytes32 items)` with `escrow = keccak256(escrow account)`, `player` = the ed25519 public key, `items = keccak256(ids as 32-byte words ‖ amounts as 32-byte words)`, ids ascending |
| Signer | NEAR's MPC network, domain 0 (secp256k1), path `encroe/items/1`, for `encroe-items-ba9e16.testnet`: `0x30e6f17b…AbbCd` |
| Token id | `keccak256(escrow account)` with its low 32 bits replaced by the game's item id |

Held by: `contracts/encroe-items` `claim_digest_is_eip712` and `contracts/evm` `test_digest_is_the_one_NEAR_signs`
(the same digest, `0x5ef45b10…`, from two implementations).

## 10. A game core's snapshot

`count:u32 ‖ (pk[32] ‖ n:u32 ‖ (id:u32, qty:u32)*)*`, little-endian; a player's served state is section 4's `state`.
See [cores/README.md](../cores/README.md).
