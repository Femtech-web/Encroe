# Trust

What you have to trust, and how to check it, for each part of Encroe. Everything runs on NEAR testnet; no mainnet
transaction has ever been sent.

## By part

| Part | What you trust | How to check it yourself |
|---|---|---|
| **The key** | NEAR's MPC network (`v1.signer-prod.testnet`, domain 2) to derive a key for the escrow's identity and publish it only when that contract asks; and its threshold of signers not to collude to derive it early | The app id is SHA3 of the escrow account and path ([`release.ts`](../web/lib/encroe/release.ts) `appId`); the release is a BLS signature checked by pairing, `e(sig, g2) = e(H(pk‖app id), pk)`, in every browser that brings a game back |
| **The escrow contract** | Nothing beyond its code: it has no access keys, so nobody can change it | `view_access_key_list` returns no keys; `view_code`'s sha256 is the published build (`08d9174f…`); the escrow page shows both, live |
| **The verifier build** | Nothing beyond the source: the escrow pins its wasm's sha256 (`9c0eb2e7…`) | `make build` rebuilds it; `scripts/reproduce/e3.sh` reruns a recorded run outside the enclave, byte for byte |
| **Who runs the verifier** | **V1:** OutLayer's TDX worker ran the pinned build on the sealed package. **V2:** that worker's Intel TDX quote, verified by NEAR's DCAP verifier (`tee-verifier-2026-07-22.testnet`), bound to this exact run's input and output | The escrow's `get_runs`: a run is `accepted` only at V2; `crates/encore-attest` checks any quote against Intel's collateral independently |
| **Who reads the studio's secret** | OutLayer's keystore, which releases the epoch's key row only to the pinned verifier, called by this escrow | GO_NO_GO §E2: a thief build and a direct call were refused |
| **The sealed package** | Nothing: FastFS serves it, the hash the escrow committed decides it | Every revive checks sha256 against `pkg_sha256` before opening anything (`/revive?…&tamper=1` shows the refusal) |
| **The studio** | To seal its real world: all its players, their real items, and the core its live server runs | Each player checks their own items against the root NEAR holds ("Is my stuff in the vault?"); the site serves its core's sha256 for comparison with the committed `core_sha256`; the enclave checks the core serves every sampled player exactly as committed |
| **The players' privacy** | Salted leaves and the package's encryption, until the release | A leaf is SHA-256 over the player's key, items and a fresh 32-byte salt; the site hands a player their salt only for a request signed by their key |
| **The site, its relayer, the agent, the MCP server** | Nothing for safety: they send calls anyone may send and show data anyone may read. For liveness, a release waits for someone to ask: the agent, a visitor, or anyone with a NEAR account | Everything they show is re-derivable from NEAR views and FastFS; `/break` shows the contract refusing what it should |
| **The browser that brings a game back** | Its own code, which is this repository's | `release.test.ts` and `revive.test.ts` hold it to the Rust tools on real released data |

## By actor

| Actor | Trusted for | How anyone checks it |
|---|---|---|
| The studio | Sealing its real world, and its heartbeat while it lives | Players' inclusion checks; the enclave's verdict on the sealed core |
| NEAR's MPC network | Releasing the key only on the contract's request | The release's pairing check |
| OutLayer's TDX worker | Running the pinned verifier (V1) | V2: the quote, verified on NEAR, bound to the run |
| NEAR's DCAP verifier | Checking Intel TDX quotes | Its contract is NEAR's; `encore-attest` checks the same quote against Intel PCS independently |
| The escrow | Nothing: keyless | Its keys and code hash |
| Our relayer, agent and site | Nothing for safety | Every action they take is permissionless and recorded on chain |

## What the escrow cannot know

- **Whether the sealed world is the whole world.** The enclave checks the sealed core against the sealed snapshot;
  it cannot see the studio's live database. Players close that gap one by one: each can prove their own items are
  in the root, and a player missing from it can say so publicly, with the escrow's epoch as evidence.
- **Whether the live server runs the sealed core.** The site shows the sha256 of the core it serves; the escrow
  holds the sha256 of the sealed one. Any difference is visible to anyone who looks.
- **Whether a released game is hosted.** After a release every player can run the world in their browser;
  shared hosting, paid only while a host provably serves it, is designed and not built (README, "Next").
