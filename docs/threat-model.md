# Threat model

## Assets

- **Players' items and progress**, sealed in an epoch's snapshot.
- **The game's server**, the sealed core: what lets the world run again.
- **The key** that opens the sealed package: before the release, it must exist nowhere.
- **Players' privacy** before a release: who holds what.

## Actors and capabilities

| Actor | Can | Cannot |
|---|---|---|
| The studio | Seal epochs, send heartbeats, declare end of life, choose its grace period at creation | Change the escrow's code or rules (no keys); stop a release once its heartbeat lapses; read the key before the release |
| A player | Play, check their own items against the root, keep a key backup, release a silent escrow, bring a released game back | See other players' items before a release |
| A stranger | Call anything public: verify, prove, release | Release early, prove another run's quote, seal, heartbeat |
| OutLayer's worker | Run the pinned verifier on the sealed package | Read the secret row for another build or another caller; have a fake result accepted (NEAR checks its quote) |
| Our site, relayer and agent | Send permissionless calls; serve the game; hand players their proofs | Anything the escrow refuses; their keys hold no power over any escrow |
| A host after release | Serve a revived world | Change it undetectably: every player's browser checks the package and core hashes |

## Threats and mitigations

### The studio

| Threat | Mitigation | Where |
|---|---|---|
| Seals a broken or fake build | The enclave runs it and checks it serves sampled players exactly and conserves items; a failing run turns the badge red | escrow `on_run`; life-52e4 steps 3–4 |
| Seals a world that leaves players out | Each player checks their own inclusion against NEAR's root; the epoch's player count is public | `/play` vault check; `docs/trust.md` |
| Rolls the world back to an older epoch | Epochs only move forward | escrow `commit`; test `an_epoch_cannot_be_rolled_back` |
| Keeps a dead game locked with heartbeats | A heartbeat is the studio's own signature: if it can still send them, it is alive. A stranger's heartbeat is refused | `owner only`; `/break` attack 02 |
| Changes the rules after players trust them | No access keys; factory escrows never had one | escrow pages; `/break` attack 07 |

### Strangers and attackers

| Threat | Mitigation | Where |
|---|---|---|
| Release a living studio's game | The contract releases only after the heartbeat lapses past the grace period, or an end of life is due | `/break` attack 01; kill-827e step 8 |
| Get a tampered build verified | The escrow checks the package's hash before calling the enclave | `/break` attack 04 |
| Pass one run's TDX quote off for another | The quote's report data must be this run's task hash, recomputed by the contract | `/break` attack 05; life-52e4 step 8 |
| Serve players a doctored game after the release | The browser checks the package hash, the core hash and the root before running anything | `/revive?…&tamper=1`; `revive.test.ts` |
| Read players' items before the release | The package is encrypted; leaves are salted; a player's salt goes only to a request signed by their key | `/api/proof`; `proof.ts` |
| Play as someone else | Every move is signed by the player's ed25519 key; replays and stale moves are refused | `world.test.ts` |
| Fill the world or flood the API | Per-address rate limits on joins, moves, releases and attacks; 64 players per world | `lib/game/http.ts` |

### Infrastructure

| Threat | Mitigation |
|---|---|
| OutLayer's operator returns a fake verdict | A run counts only after NEAR's DCAP verifier accepts its quote, bound to its input and output |
| Our site disappears | Nothing depends on it: the escrow is on NEAR, the package on FastFS, and the revive code runs from any copy of this repository |
| Our relayer key leaks | It holds only gas money: every call it can send, anyone may send |
| The testnet RPC is down or rate-limited | Any NEAR RPC serves the same state; the runbooks retry their reads |

## Out of scope

- A compromise of NEAR's MPC network threshold, of Intel TDX, or of NEAR consensus.
- Cheating within a game's own rules (a core's design is the studio's).
- Mainnet economics: deposits, hosting payments and token bridges are designed, not built.
