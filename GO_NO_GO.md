# Encroe: Proof of Continuity, go/no-go

**Date:** 2026-11-11 (UTC). Every on-chain step ran on **NEAR testnet**, against the live MPC contract `v1.signer-prod.testnet` and OutLayer's `outlayer.testnet` with its TDX workers. Nothing is mocked: no simulated transactions, secrets or attestations.

| Experiment | Status |
|---|---|
| **E1: contract-controlled key release** | **PASS** |
| **E2: OutLayer confidential verification** | **PASS** |
| **E3: independent reproduction** | **PASS** |
| **T1: TEE proof verified on NEAR** (added 2026-11-12) | **PASS** |

**Decision: GO** for the core mechanism.

The three dependencies Encroe relies on work on real infrastructure today:
1. A sealed package whose key only a contract can release.
2. A pre-release check of that package by an attested program that alone can read it.
3. After release, a public re-run that reproduces the attested result.

The limits on that claim are in [Remaining risks](#remaining-technical-risks). In E1–E3, on-chain acceptance of an OutLayer result trusted OutLayer's operator account, and the quote was verified off-chain. **T1 removes that:** `contracts/encore-t1` accepts a run only after NEAR's DCAP verifier checks its quote, bound to the exact run ([T1](#t1-2026-11-12-the-tee-proof-verified-on-near--pass)).

Reproduce:
- `make test`: offline tests.
- `make reproduce-e1`
- `make reproduce-e3`

---

## Accounts and artefacts

| What | Value |
|---|---|
| Publisher | `encore-pub-6b4dad.testnet` |
| Unrelated caller | `encore-stranger-6b4dad.testnet` |
| E1 contract | `encore-e1-6b4dad.testnet`, code_hash `4Trmxw5D…` (sha256 `3374715f…`). Source: `docs/e1-contract-lib.rs`; diff to current: `docs/e1-to-e2-contract.diff`. **Not locked.** |
| E2/E3 contract | `encore-e2-6b4dad.testnet`, code_hash `E3RYM3o7…` (sha256 `c1c6d6f1…`, the current `contracts/encore-poc`). **Locked: zero access keys before release** ([HTTwdDLL](https://testnet.nearblocks.io/txns/HTTwdDLLHPp3DdtSYCiom2A7vHNia7jfSAMJBK16fMex)). |
| CKD domain | 2. Testnet MPC `state` lists `{"id":2,"purpose":"CKD"}`. |
| Verifier build | `encore-verifier.wasm` (wasm32-wasip2), sha256 `9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad`, on FastFS at `test.fastfs.io/encore-pub-6b4dad.testnet/outlayer.testnet/<sha256>.wasm`. Uploaded in [5weztGAA](https://testnet.nearblocks.io/txns/5weztGAAQWVFputB511yyJQSXApeJPk2jKPF2CjJCNgh) and [8Tmcndb7](https://testnet.nearblocks.io/txns/8Tmcndb7ZwQ92iwAnHp81728nSHwJg4gU71wrfSDgeAj). |
| Unauthorized build | `encore-thief.wasm`, sha256 `401a820b…1649` ([5o674h6R](https://testnet.nearblocks.io/txns/5o674h6RGVpUyPYt7XQEsGgjzCxq1XUYoMPpjbjfcBGB)) |
| Game core | 1.8 KB deterministic WASM, sha256 `3c83b9b7…23c0`, sealed inside each package |

---

## E1: PASS

Contract `encore-e1-6b4dad.testnet`. The release condition is the publisher heartbeat lapsing for 240 s.

| # | Guarantee | Evidence |
|---|---|---|
| 1 | **Data is encrypted to a contract-controlled identity** | The package key is IBE-sealed to `app_id = SHA3-256("near-mpc v0.1.0 app_id derivation:" ‖ encore-e1-6b4dad.testnet ‖ "," ‖ encore/g1/1)` under the live domain-2 key. Commitment `docs/results/e1/commitment.json`, committed in [3unGPJ8s](https://testnet.nearblocks.io/txns/3unGPJ8sLmSAxtL1wCZjNGFMgQyAkQCnnrD1zQ7Ct12Y). |
| 2 | **Early release is rejected** | The stranger was refused ([EoippMwH](https://testnet.nearblocks.io/txns/EoippMwHTte64LdH6tCnxLYromMDgPQx4rMm7F2PgcaN)) and so was the publisher ([93SvMUgc](https://testnet.nearblocks.io/txns/93SvMUgcsow6QQgcfvyeRi1veD24hshbp5wyeCMWedqJ)), both with `release condition not met`. A second release was also refused ([6ED3xm31](https://testnet.nearblocks.io/txns/6ED3xm313HC3vSyR1PFMKYapA9pxPp7XDrgw1EdVpCXe), `already released`). |
| 2b | **Nobody else can obtain the key** | The stranger called `request_app_private_key` directly for the same path ([C2WN1euv](https://testnet.nearblocks.io/txns/C2WN1euvJEzfsqARG6JhAMbad169um8yFzYJgbVMycU8)). MPC returned the key for `app_id(stranger, path)`: it verifies only for the stranger and can't open the package (`docs/results/e1/06b-stranger-key-check.json`). |
| 3 | **Release after the agreed condition** | Heartbeat ([GeCzs6VK](https://testnet.nearblocks.io/txns/GeCzs6VK9MPbwspT2BEvqYGYGvFnADYM6gHcAGUJbUa4)), then a 240 s lapse, then `release_condition_met = true` |
| 4 | **An unrelated caller triggers it** | The stranger's `release()` ([92vcC2i3](https://testnet.nearblocks.io/txns/92vcC2i3vqhCJhtSVmMqGSSwTjNw8jMbvkjQgqSeFpUW)). MPC logged `predecessor=encore-e1-6b4dad.testnet, AppPublicKeyPV(identity, identity), domain_id 2`. The callback logged `released by encore-stranger-6b4dad.testnet`. |
| 5 | **The recovered key decrypts the original data** | `sha256(recovered k) = a99f733b…`, equal to the original. Package, core and root hashes all match (`docs/results/e1/10-open.json`). |
| 6 | **Independently verifiable** | Our arkworks check `e(sig,G2) = e(H(pk‖app_id), pk)`, plus `app_id` derived from `(contract, path)` (`docs/results/e1/09-verify-release.json`). The MPC contract also runs the same check on-chain before resuming a PV request (`ckd_output_check`, near/mpc `crates/contract/src/primitives/ckd.rs`). |

**Public release** is a documented MPC feature: identity points are accepted in `AppPublicKeyPV` "to support use cases where the derived key is intentionally public", so `big_c` is the key itself. The `a = 1` fallback is implemented but wasn't needed.

**Cross-checks:** our implementation matches every near/mpc CKD test vector, and a **live** MPC response.

---

## E2: PASS

Contract `encore-e2-6b4dad.testnet`, with the verifier URL and hash pinned at deploy ([obRt32DQ](https://testnet.nearblocks.io/txns/obRt32DQz6a9DCGe5RZBZhfUqAtFJxtNtJd8NsAQsDG)) and the epoch committed ([B3XMSk7Y](https://testnet.nearblocks.io/txns/B3XMSk7YqwuSSW2u9wZAqKCJnJeH6UfJ8jhkxh7ru5Vg)).

**Secret row** ([AdHzRkvB](https://testnet.nearblocks.io/txns/AdHzRkvB1hRhZrT7eAoZ4vDrKJ1H4BeZWvr6bymbdTJJ), on-chain row in `docs/results/e2/04b-secret-row.json`):
- accessor `{"WasmHash": 9c0eb2e7…}`;
- access `And[WasmHash(9c0eb2e7…), Predecessor(Whitelist[encore-e2-6b4dad.testnet])]`.

The X25519 key came from `POST /secrets/pubkey` sent with **`secrets_json: "{}"`**. `(k, r)` were ECIES-encrypted locally, so **the plaintext never reached OutLayer's coordinator**.

| # | Guarantee | Evidence |
|---|---|---|
| 1 | **The approved program can access the secret** | The stranger called `encore-e2.verify(package)` ([8tuxLkDX](https://testnet.nearblocks.io/txns/8tuxLkDXF5KdVDuzFuF3xJ5jXR6syN394SEiEY6FEmCb)), OutLayer request **25728**. The verifier ran in `mode:"secret"`, with `key_binding:true`, which is only possible with the real `(k, r)`. The contract recorded `accepted:true` (`docs/results/e2/runs.json`). |
| 2 | **An unauthorized program cannot** | **Different build, through the contract:** `probe(thief)` ([BtZAkovG](https://testnet.nearblocks.io/txns/BtZAkovGZA7Yzdb1jbD7jwUcQmCUMjhhXPgHkifTreJ7)), request **25734**. The thief ran and reported `encore_k_sha256:null, encore_r_sha256:null, secret_rows:null`. **Right build, called directly by a user:** [6mEcxVJE](https://testnet.nearblocks.io/txns/6mEcxVJEdfNci461zVSzRSV7aByVNSed21zbkeHeth8K), request **25741**. Refused before the guest ran (0 instructions) with `"Access denied by access condition — signer encore-stranger-6b4dad.testnet, called from encore-stranger-6b4dad.testnet"`. |
| 3 | **It decrypts and runs a deterministic test within real limits** | Re-encryption binding, AES-GCM decrypt, core hash, player root, 16 seed-sampled players served correctly by the sealed core (run under `wasmi`), 32 seed-derived trades, item conservation: all `true`, `pass:true`. Used **140.6 M instructions, 3.8 s** (limits we set: 100 B, 120 s; platform maximum 180 s). Charged 0.0015 NEAR. |
| 4 | **The result is bound to the package, program version and inputs** | The attestation's `report_data` equals our recomputed `SHA-256("execute" ‖ task_id ‖ build_target ‖ wasm_hash ‖ input_hash ‖ output_hash ‖ block_height ‖ caller ‖ secrets_ref ‖ timestamp ‖ attached_usd)`. `executed_wasm_sha256` is the pinned verifier. `input_hash` equals `SHA-256` of the **exactly reconstructed** input (package, commitment, seed and identity; `contracts/encore-poc/tests/reconstruct_input.rs`). `output_hash` equals the output the contract received. |
| 5 | **A third party can check the genuine attestation** | `encore-attest` (dcap-qvl) verifies the quote against **collateral fetched directly from Intel PCS**, not OutLayer's: TCB `UpToDate`, no advisories. MRTD and RTMR0–3 are in `worker.outlayer.testnet get_approved_measurements`. Results: `docs/results/e2/attestation-25728-check.json`; the thief run's attestation is in `attestation-25734-check.json`. |

---

## E3: PASS

On the **locked** E2 contract:
1. An early release was refused ([8xxFgMwN](https://testnet.nearblocks.io/txns/8xxFgMwNCNF9Nv4aAr5RHRu28H7qgFBkQuiACnxbN4Fr)).
2. The publisher called `declare_end_of_life(0)` ([9jfaoAts](https://testnet.nearblocks.io/txns/9jfaoAtsoaePVS8Pub1Dgp1w9AVQX8viUj1C9vHxdcJb)).
3. The stranger's `release()` succeeded ([2fNieeX4](https://testnet.nearblocks.io/txns/2fNieeX4hEkcJy65w6QCRSUX1nAmHL6nksSYeJFVWH7a)).

`make reproduce-e3` (output in `docs/results/e3/06-reproduce-e3.txt`), public data only:

| # | Requirement | Result |
|---|---|---|
| 1 | Obtain the released material | Read `big_y` and `big_c` from contract state; `sig` verifies for `(encore-e2-6b4dad.testnet, encore/g1/1)` |
| 2 | Decrypt the exact committed package | `pkg_sha256`, `core_sha256` and `root` match; `sha256(recovered k) = c3c0f33e…`, equal to the original |
| 3 | Run the same deterministic test outside OutLayer | Same verifier build, fetched by hash from FastFS, run under wasmtime in release mode with run 25728's on-chain seed |
| 4 | Reproduce the expected result | Every output field equals the **OutLayer-attested** output except `mode` ("secret" vs "release"). `transcript_sha256 = f9231e74…3e1b` on both. |
| 5 | Verify package hashes and execution evidence | Package hashes as in row 2. Run 25728's attestation re-verified (Intel PCS, approved measurements, `report_data` binding, output bound). |

---

## T1 (2026-11-12): the TEE proof verified on NEAR — PASS

The main limit above was that on-chain acceptance of an OutLayer result trusted OutLayer's operator account. That limit is now removed for verification runs.

| Step | Evidence |
|---|---|
| Encroe's E2 run, re-checked on NEAR | Run #25728's TDX quote, with fresh Intel PCS collateral, returns **Verified / `UpToDate`** from NEAR's DCAP verifier `tee-verifier-2026-07-22.testnet` (`verify_quote`, a free view). The returned report's `report_data` is our recomputed task hash `93f4eaec…`, which binds the verifier build, input, output, caller and secret row (`docs/results/t1/verify-quote-view-25728.borsh`). |
| The contract | `contracts/encore-t1` (`encore-poc` is untouched, so E1–E3 still reproduce). A verification run is accepted **only** after `prove_run` succeeds. `prove_run` checks three things: (1) the attestation's fields equal the contract's own record of the run (pinned build, the SHA-256 of the input it sent and of the output it received, the caller, the secret row); (2) NEAR's DCAP verifier accepts the quote with TCB `UpToDate`; (3) the worker image is among OutLayer's approved measurements, which `refresh_measurements` copies on-chain (129 on testnet). 4 tests run on the real verifier output. |
| Deployment | `t1.encore-pub-6b4dad.testnet` (code sha256 `332d1ad0…`, `docs/results/t1/contract-sha256.txt`). Epoch committed `B2p6UV83…`; images loaded `31gvdEsf…`; secret row stored `APicrNZb…` (encrypted locally, so the coordinator saw `"{}"`). |
| Live run 0 | The stranger's `verify` became OutLayer request **30468**. Its output passed every content check, but the run stayed `accepted: false`. `prove_run` (`97CW3VJ2…`) logged *"run 0 T1: quote verified on NEAR (UpToDate)"*, and the run became `accepted: true`. |
| Binding on-chain | Run 1 is OutLayer request 30473. Proving it with run 0's genuine quote was **refused**: *"attestation: input differs from what this contract sent"* (`EGnNCTQw…`). Its own quote was accepted (`nKaFCnFV…`). |

Reproduce: `scripts/testnet/t1.sh status`. To re-check any run: `scripts/testnet/t1.sh prove <request id>`. The contract tests run with `cd contracts/encore-t1 && cargo test`.

## Remaining technical risks

1. **On-chain acceptance still trusts OutLayer's operator.**
   - `encore-e2` accepted the result because it came back from `outlayer.testnet`, and OutLayer resolves runs from any key on `worker.outlayer.testnet`. That account has **3 full-access keys** next to 60 TDX-registered function-call keys.
   - The cryptographic guarantee comes only from the quote check, which we do **off-chain**.
   - For Encroe's on-chain logic (heartbeats requiring a verified epoch, bonds) the contract must verify the quote itself, which is custom work. dcap-qvl has a `contract` feature, and OutLayer's register contract already verifies quotes on-chain.
2. **OutLayer governance and availability.**
   - Approved measurements are set by `owner.outlayer.testnet` alone.
   - Attestation records and the pubkey come from OutLayer's closed-source coordinator. Quotes are self-verifying once fetched, and we keep copies in `docs/results/`.
   - The keystore master derives from OutLayer's own CKD path, under their DAO.
3. **Network quirk.** `testnet-api.outlayer.ai` resolved to non-routable addresses here; it's reached through an `/etc/hosts` entry pointing at the address Google's DNS returns. That isn't an OutLayer guarantee, but it would affect operational tooling.
4. **The E1 instance was never locked.** The E2 instance was, before release. A real deployment must lock (or use an immutable global contract) *before sealing* any epoch.
5. **No on-chain re-verification of the released key in our contract.** The MPC already verifies it before responding. Adding our own check needs on-chain hash-to-curve.
6. **The custom IBE layer is unaudited.** No Fujisaki–Okamoto transform. `r` is as sensitive as `k`.
7. **The conformance suite is a toy.** It covers state serving and conservation on a 1.8 KB core. Test strength, not execution, defines what "recoverable" means, and real game servers need much larger budgets: chunked or multi-run verification within OutLayer's 180 s per run.
8. **MPC trust.** Release depends on the MPC threshold, both for liveness and for not releasing early.
9. **Data availability.** Packages are passed inline (about 9 KB) and stored in this repo. Production needs permanent storage.
