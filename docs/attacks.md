# Attacks

Every way to cheat Encroe we have tried, what stops it, what it costs the attacker, and where the refusal is on
record. "Live" means a real testnet transaction was sent and refused; the transaction is linked from the record.
Each row's defence is also held by a test. The [threat model](threat-model.md) explains who could attack; the
[properties](properties.md) list what holds.

## Against the escrow

| # | Attack | Who | What stops it | Cost to the attacker | Evidence |
|---|---|---|---|---|---|
| 1 | Release a living studio's game early | anyone | `release` checks the heartbeat lapsed past the grace period, or an end of life is due: "release condition not met" | a refused transaction's gas | live: [/break](https://encroe.vercel.app/break) "early-release"; [kill-827e](results/escrow/kill-827e/README.md) step 8; test `nobody_releases_while_the_studio_is_alive` |
| 2 | Keep a dead studio's game locked by sending its heartbeat | anyone but the studio | `heartbeat` is the owner's alone: "owner only" | gas | live: /break "fake-heartbeat" |
| 3 | Seal a fake world over the real one | anyone but the studio | `commit` is the owner's alone: "owner only" | gas | live: /break "fake-seal" |
| 4 | Roll the world back to an older epoch | the studio | epochs only move forward | gas | test `an_epoch_cannot_be_rolled_back` |
| 5 | Get a tampered build verified | anyone | the escrow hashes the package before calling the enclave: "package does not match the committed pkg_sha256" | gas | live: /break "tampered-package" |
| 6 | Reuse one run's enclave proof for another run | anyone | the quote's report data must be this run's task hash, which the escrow recomputes: "input differs" | gas, and the enclave run it copied from | live: /break "replay-quote"; [life-52e4](results/escrow/life-52e4/README.md) step 8 |
| 7 | Release a game twice | anyone | "already released" | gas | live: /break "second-release"; test `a_silent_studio_is_released_by_anyone_and_cannot_reseal` |
| 8 | Change the escrow's rules | anyone, the studio and us included | no access keys; a factory escrow never had one | nothing to try | every escrow page (`view_access_key_list` is empty) |
| 9 | Seal a build that misserves players or creates items | the studio | the enclave serves 16 sampled players byte for byte and checks seeded trades conserve items; a failing run is red for everyone | the enclave run's fee, and a public red badge | [life-52e4](results/escrow/life-52e4/README.md) steps 3–4 |
| 10 | Pass off an operator's verdict as the enclave's | OutLayer's operator | a run is accepted only once NEAR's DCAP verifier accepts its TDX quote, bound to its input and output | — | every green run; test `only_a_quote_nears_verifier_accepted_turns_it_green` |
| 11 | Read the studio's key row with another build, or call the keystore directly | anyone | the row is readable only by the pinned verifier, called by this escrow | the run's fee | [GO_NO_GO.md](../GO_NO_GO.md) §E2: a thief build and a direct call, refused |

## Against a game coming back

| # | Attack | Who | What stops it | Cost | Evidence |
|---|---|---|---|---|---|
| 12 | Serve a doctored package after the release | a host, FastFS, or us | the browser checks the package's hash, the core's hash and the players' root before running anything | nothing: the page refuses it | `/revive?…&tamper=1` (the page flips one byte itself and shows the refusal); `revive.test.ts` |
| 13 | Forge the release | anyone | the release is NEAR's MPC signature for this contract's identity, checked by pairing in the browser | — | every revive, checks 2–3; `release.test.ts` |
| 14 | Read players' items before the release | anyone | the package is encrypted; leaves are salted; a player's salt goes only to a request signed by their key | — | `proof.test.ts`; `/api/proof` |

## Against players

| # | Attack | Who | What stops it | Cost | Evidence |
|---|---|---|---|---|---|
| 15 | Play as someone else | anyone | every move is signed by the player's ed25519 key under a per-game domain | — | `world.test.ts` |
| 16 | Replay a player's move | anyone | each move carries a nonce the world has to see rise | — | `world.test.ts` |
| 17 | Flood the world or the API | anyone | per-address rate limits on joins, moves, releases, attacks, uploads and claims; 64 players per world | a refused request | `lib/game/http.ts` |

## Against the item handover

| # | Attack | Who | What stops it | Cost | Evidence |
|---|---|---|---|---|---|
| 18 | Claim another player's items | anyone | `encroe-items` requires the player's ed25519 signature over the escrow and the destination: "the player's key did not sign this claim" | gas | live: [items](results/items/README.md) `7CxQooGD…` |
| 19 | Claim more than was sealed | the player | the leaf is recomputed from the claimed items and must reach the committed root; nothing is signed | gas | live: items `6dPsb3Wh…` |
| 20 | Claim from a world that is still alive | anyone | the escrow must be released; nothing is signed | gas | live: items `21kWbxfz…` |
| 21 | Claim from a fake "escrow" that says it is released | anyone | only `*.encroe.testnet` accounts are accepted, which only the locked factory can create | — | `encroe-items` `claim` |
| 22 | Claim twice | the player | one claim per player per escrow: "already claimed" | gas | live: items `9gd5ysKb…` |
| 23 | Relay one signature twice | anyone | one mint per player per escrow on the token: "already claimed" | a reverted transaction's gas on Base | live: items, the second relay; `EncroeItems.t.sol` |
| 24 | Mint with any other key, or change the claim after signing | anyone | the token recovers the signer from the claim itself and checks it is the MPC-derived address | gas | `test_refuses_any_other_signer`, `test_refuses_a_claim_changed_after_signing` |

## Against the site's helpers

| # | Attack | Who | What stops it | Cost | Evidence |
|---|---|---|---|---|---|
| 25 | Use the browser-sealing relayer to put arbitrary files on NEAR | anyone | `/api/seal/fastfs` uploads only a package whose hash the escrow already committed (409 otherwise) | a refused request | checked live against `matchday.encroe.testnet` |
| 26 | Steal the site's relayer key | an attacker of our hosting | it holds only gas money, and every call it can send, anyone may send | our gas money | [trust](trust.md) |
| 27 | Take the site down | anyone | nothing depends on it: the escrow is on NEAR, the package on FastFS, and the revive code runs from any copy of this repository | — | [trust](trust.md) |
