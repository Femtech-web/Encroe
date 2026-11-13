# Encore: Proof of Continuity (go/no-go experiments)

"The publisher shut down. The game didn't."

This repository tests three technical dependencies on real NEAR testnet infrastructure. Results and evidence are in **[GO_NO_GO.md](GO_NO_GO.md)**.

## Layout

| Path | What |
|---|---|
| `crates/encore-crypto` | NEAR CKD compatibility (`derive_app_id`, `H(pk‖app_id)`, release verification), IBE key sealing, AES-GCM package, salted player-state Merkle commitments |
| `crates/encore-core-game` | The toy deterministic game core sealed inside a package (wasm32-unknown-unknown, no imports); a `broken` feature for rejection tests |
| `crates/encore-verifier` | The readiness verifier: an OutLayer guest (wasm32-wasip2) and a native library. Secret mode (OutLayer keystore) or release mode (public CKD key) produce the same transcript. |
| `crates/encore-thief` | Rejection-test guest that reports whether it received the secret row (hashes only) |
| `crates/encore-attest` | Independent check of an OutLayer TDX attestation: dcap-qvl against Intel PCS collateral, approved measurements, recomputed `report_data`, input and output hashes |
| `crates/encore-cli` | `encore`: seal, OutLayer ECIES secret, verify release, open, make verifier input, preflight, FastFS payloads, player inclusion check |
| `contracts/encore-t1` | Encore with T1: a verification run is accepted only after NEAR's DCAP verifier checks its TDX quote, bound to the exact run the contract requested |
| `contracts/encore-poc` | Contract: heartbeat or end-of-life release condition, CKD public release, OutLayer `request_execution` with the pinned verifier |
| `scripts/` | `build/all.sh`, `test/offline.sh`, `reproduce/e1.sh`, `reproduce/e3.sh`, `testnet/e2.sh` (live E2 steps), `testnet/t1.sh` (live T1 steps), `near/call.sh`, `near/view.sh` |
| `docs/` | `results/e1`, `results/e2`, `results/e3`: commitments, sealed packages, transaction outputs, verifier outputs, attestation checks; the E1 contract and its E2 diff |
| `third_party/` | Upstream source files read to match interfaces (near/mpc, OutLayer) |

## Build and test

Requirements:
- Rust with the `wasm32-unknown-unknown` and `wasm32-wasip2` targets;
- `wasmtime`;
- Node.js (`npm install` provides `near-cli-rs` and `cargo-near`);
- Python 3.

```
npm install
make test          # builds everything; CKD vectors, IBE, rejection tests, native-vs-WASM determinism
make reproduce-e1  # third-party check of the E1 release from public data (testnet RPC + FastFS)
make reproduce-e3  # E3: released key + package + verifier by hash vs the OutLayer-attested run
```

Secrets (`.secrets/`), account ids (`.env`, template `.env.example`) and keys (`~/.near-credentials`) are never committed; a gitleaks pre-commit hook (`.githooks/`) refuses them. The sealed packages and commitments in `docs/results/` are public by design.
