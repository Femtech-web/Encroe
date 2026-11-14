# For judges

**Encroe**: a studio seals its game server into a NEAR contract with no keys. While the studio lives, anyone can
check the sealed build is real. If it goes silent, anyone can release it, and the game goes to its players. The
thesis, in one page: [docs/thesis.md](docs/thesis.md).

**Watch first:** [the demo video](https://youtu.be/nnDuYhpsjj0).

Everything below runs on NEAR testnet with real transactions. Nothing is mocked; where a run simulates something
(a studio going silent, scripted test players), it says so.

## Five minutes on the site: [encroe.vercel.app](https://encroe.vercel.app)

1. **Play.** Open `/play` and pick one of five games in five languages. Try **Starhaul** (Zig): a 3D sector where
   you click an asteroid belt to mine it. Your browser makes an ed25519 key and signs every move; every rule runs in
   the game's sealed wasm core, the same bytes its escrow committed (the sha256 is in the banner).
2. **Check the vault.** On `/play`, press **Check** under "Is my stuff in the vault?". If you joined before the
   studio's last seal, your browser fetches your proof (salt and Merkle path) and checks it against the root it reads
   **from NEAR itself**, not from us. If you joined after, it says so.
3. **Kill a studio.** On the home page, **Kill a studio**. The studio behind it sealed its world, got it verified
   green, and then stopped its heartbeat. Press **Release it**: the site sends the escrow's permissionless `release`
   from a throwaway account that only pays the gas. The contract checks the silence; NEAR's MPC network publishes
   the key.
4. **Bring it back.** The page then rebuilds the game from public data only and shows each check pass:

   | Check | How |
   |---|---|
   | The escrow is released | `get_state` from NEAR's RPC |
   | The key belongs to this contract | app id = SHA3("near-mpc v0.1.0 app_id derivation:" ‖ escrow ‖ "," ‖ path) |
   | NEAR's MPC network signed the release | BLS pairing `e(sig, g2) = e(H(pk‖app id), pk)` |
   | The package is the committed one | fetched from FastFS, sha256 = committed `pkg_sha256` |
   | The released key opens it | IBE unwrap `e(sig, U)`, then AES-256-GCM |
   | The core is the build the enclave verified | sha256 = committed `core_sha256` |
   | Every player's items are there | Merkle root over every leaf = committed root |
   | It runs | the core compiles in the browser with **zero imports** |

5. **Play on.** Press **Play on**. It is the same game screen, now run by your browser on the core that came out of
   the escrow. The game's server is never called. A player who backed up their key imports it at the gate and
   finds their items.

## Try to break it, live: [/break](https://encroe.vercel.app/break)

Six real attacks, each sent from a stranger's account to a live, locked escrow, each refused by the contract in its
own words (`web/lib/encroe/attacks.ts`; a test checks every expected refusal is written in the contract's source):

| Attack | Refusal |
|---|---|
| Release a living studio's game | `release condition not met: publisher heartbeat is live and no end of life is due` |
| Keep a dead studio locked with a fake heartbeat | `owner only` |
| Seal a fake world over the real one | `owner only` |
| Get a tampered build verified | `package does not match the committed pkg_sha256` |
| Replay a NEAR-accepted TDX quote for another run | `attestation: input differs from what this contract sent` |
| Release a game twice | `already released` |

Two more need no transaction: changing an escrow's code (it has no keys; the page reads the count and the code hash
live) and serving players a doctored package (`/revive?...&tamper=1` flips a byte; the hash check refuses it).

## The preservation agent and the MCP server

[`/agent`](https://encroe.vercel.app/agent) releases any watched escrow whose studio went silent and brings every
released game back with the same eight checks, keeping a public log; `.github/workflows/preserve.yml` runs it every
30 minutes. Its first sweep brought back five released escrows (Rust, C++, C and the go/no-go core), all eight checks
passing. Any AI agent can do the same through the site's MCP server:

```bash
claude mcp add --transport http encroe https://encroe.vercel.app/api/mcp
```

## Check it without our site

```bash
# Any escrow's state, straight from NEAR:
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"encroe-kill-beaa.testnet","method_name":"status","args_base64":"e30="}}' \
  | python3 -c 'import json,sys;print(json.loads(bytes(json.load(sys.stdin)["result"]["result"])))'

# Locked: no access keys, so nobody (including us) can change its code.
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"encroe-kill-beaa.testnet"}}'

make test            # Rust: CKD vectors, IBE, verifier determinism; the escrow contract's lifecycle tests
cd web && npm ci && npm test   # the browser code, against real released data from the chain
```

## Claims and their evidence

| Claim | Evidence |
|---|---|
| The key exists only in NEAR's MPC network until the contract asks for it | [GO_NO_GO.md](GO_NO_GO.md) §E1; the release check above |
| Only the pinned verifier, run through the contract, can use the studio's secret | [GO_NO_GO.md](GO_NO_GO.md) §E2: a thief build and a direct call were refused |
| The contract trusts the enclave only after NEAR's DCAP verifier checks its quote; a replayed quote is refused | [life-52e4](docs/results/escrow/life-52e4/README.md) steps 7 and 8 |
| A broken build turns the badge red | [life-52e4](docs/results/escrow/life-52e4/README.md) steps 3 and 4 |
| Nobody can release while the studio lives | [life-52e4](docs/results/escrow/life-52e4/README.md) step 9, [kill-827e](docs/results/escrow/kill-827e/README.md) step 8 |
| A played world is sealed and verified green, and a player checks their items from the browser | [ember-3924](docs/results/escrow/ember-3924/README.md) |
| Anyone releases a silent studio; the game comes back in a browser and play goes on | [kill-827e](docs/results/escrow/kill-827e/README.md) |
| A visitor does it from the site, with no wallet | [kill-beaa](docs/results/escrow/kill-beaa/README.md) |
| The escrow works for any language: Rust, C++ and C cores all pass the same pinned verifier and come back in a browser | [cores](docs/results/escrow/cores/README.md); `web/lib/cores/cores.test.ts` |
| Zig and Go too: two more games, sealed into factory escrows, verified green; each rebuilds byte for byte | [engines](docs/results/escrow/engines/README.md) |
| A studio can seal from its browser alone: the page's own code sealed a world, and the enclave and NEAR accepted it | [browser-seal](docs/results/escrow/browser-seal/README.md); `web/lib/encroe/seal.test.ts` (opened by the Rust tools) |
| A live world stays sealed with nobody at the keyboard: a GitHub workflow heartbeats and seals it every six hours | [embergate](docs/results/escrow/embergate/README.md) (epoch 4, green) |
| A released world's items leave the game: minted on Base Sepolia, signed through NEAR Chain Signatures by a key nobody holds; forged, inflated, live-escrow and repeated claims refused | [items](docs/results/items/README.md); `contracts/encroe-items`, `contracts/evm` (the same digest on both sides) |
| Any AI agent can do the preserving: Claude Code, unmodified, with only the MCP server, released a silent studio's game and brought it back, all 8 checks, in 48 s; the game was back 17.5 s after the release transaction | [agent run](docs/results/agent-runs/20261114-0843-release-and-revive/README.md), with its full transcript |
| Every way to cheat we tried, what stopped it and what it costs; every byte format and the test holding its two implementations together | [docs/attacks.md](docs/attacks.md), [docs/crypto-spec.md](docs/crypto-spec.md) |
| A silent studio's world is released by a watcher and opened, every hash matching | [ember-3924](docs/results/escrow/ember-3924/README.md) |
| The browser code matches the Rust tools | `web/lib/encroe/release.test.ts`, `web/lib/game/proof.test.ts`: real released epochs and on-chain roots |

## Where to look in the code

| What | Where |
|---|---|
| The escrow: commit, verify, `prove_run` (NEAR DCAP), heartbeat, `release`, `status` | [`contracts/encroe-escrow/src/lib.rs`](contracts/encroe-escrow/src/lib.rs) |
| The verifier the enclave runs (pinned by hash `9c0eb2e7…`) | [`crates/encore-verifier`](crates/encore-verifier) |
| Sealing: CKD identity, IBE, AES-GCM package, salted player leaves | [`crates/encore-crypto`](crates/encore-crypto), [`crates/encore-cli`](crates/encore-cli) |
| The game's server core (every rule of Embergate) | [`crates/embergate-core/src/lib.rs`](crates/embergate-core/src/lib.rs) |
| The same interface in C++, C, Zig and Go, and what any game must export | [`cores/`](cores/README.md) |
| Sealing in the browser, and its routes | [`web/lib/encroe/seal.ts`](web/lib/encroe/seal.ts), [`web/app/api/seal`](web/app/api/seal) |
| The item handover: the claim check and the MPC request; the token | [`contracts/encroe-items/src/lib.rs`](contracts/encroe-items/src/lib.rs), [`contracts/evm/src/EncroeItems.sol`](contracts/evm/src/EncroeItems.sol) |
| Starhaul's 3D sector (it shows; the core decides) | [`web/components/play/StarhaulScene.tsx`](web/components/play/StarhaulScene.tsx) |
| The game server: signed moves into the core | [`web/lib/game/world.ts`](web/lib/game/world.ts), [`web/app/api/move`](web/app/api/move/route.ts) |
| Reviving in the browser | [`web/lib/encroe/release.ts`](web/lib/encroe/release.ts), [`web/lib/encroe/revive.ts`](web/lib/encroe/revive.ts) |
| The studio's side, scripted | [`scripts/studio/bot.sh`](scripts/studio/bot.sh), [`scripts/testnet/escrow.sh`](scripts/testnet/escrow.sh) |

## What we disclose

- **Testnet only.** No mainnet transaction was sent.
- **Simulated silence.** In every recorded release we stop the studio's heartbeat ourselves; that is the only way to
  show a studio disappearing on demand. The contract cannot tell the difference, which is the point.
- **Scripted players.** Some sealed worlds hold scripted test players (every move made by the core itself); each
  write-up says which. Neon City's browser-sealed epoch holds our own dev-server players.
- **One stranded epoch each** in `encroe-embergate` (epoch 2) and `neon-city.encroe` (epoch 1): committed, never
  verifiable. Both causes are fixed and written up; epochs only move forward, so nothing was rewritten.
- **The enclave is OutLayer's.** Its operator keys are not trusted: a run counts only after NEAR's own DCAP verifier
  accepts the quote bound to that exact run.
- **Limits.** A world holds 64 players (the snapshot and the enclave's checks are sized for it). A revived world runs
  in each player's browser; shared hosting after a release, and paying hosts on proof, are not built. Unity's C# is not
  among the languages yet.
