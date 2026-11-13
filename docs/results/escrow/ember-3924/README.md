# A played world, sealed and verified green, checked by its own players (2026-11-13)

The claim: the live world of a game players actually play can go into escrow, and each player can check from
their own browser that their items are inside, against the root NEAR holds, without trusting the game's server.

- **The game**: Embergate ([`web/`](../../../../web)), whose every rule runs in one core,
  [`crates/embergate-core`](../../../../crates/embergate-core) (wasm sha256 `49ff0c57…`). Players sign every move with
  an ed25519 key made in their browser; the server loads the world into the core, makes the move there, and reads
  the world back.
- **The world**: 5 players. Ada was played by hand in a browser; Bo, Cyra, Dax and Eun were test players we scripted
  through the same signed-move API (gathering, forging a Blade and a Prism, one gift). This is disclosed, and so is
  the host: a dev server on our machine.
- **The escrow**: [`contracts/encroe-escrow`](../../../../contracts/encroe-escrow) at `encroe-ember-3924.testnet`,
  **locked before anything was sealed** (0 access keys; contract wasm sha256 `08d9174f…`, the same build as the
  [life-52e4](../life-52e4/README.md) run). Grace: 6 hours.
- **The studio**: [`scripts/studio/bot.sh seal`](../../../../scripts/studio/bot.sh), one command for the whole epoch.

| # | Step | By | Transaction | Result |
|---|---|---|---|---|
| 1 | Create, deploy, lock | | [`2iv89yJ2…`](https://testnet.nearblocks.io/txns/2iv89yJ2sT5juRm7EvTkEaiSWfuJtGxaCbHXqbXVm5yY), [`6APKqhLA…`](https://testnet.nearblocks.io/txns/6APKqhLA4r37Wq7Dn38yZaqhDd6USMN6gLiqAgePdAwi), [`828C9p9U…`](https://testnet.nearblocks.io/txns/828C9p9UjENXs6kDoTA2QotUYveyKFRevg2AbQ9SFQe1) | **0 access keys** |
| 2 | Copy OutLayer's approved enclave images | a stranger | [`CPCVMHNh…`](https://testnet.nearblocks.io/txns/CPCVMHNhQ3HSLnD6BhY72bJGnD6GtV2q35DMos1vaTyw) | 129 images |
| 3 | Export the live world from the game | the studio | | 5 players, `[{pk, items}]`, kept private in `.secrets/` |
| 4 | Seal it with fresh per-player salts; run the pinned verifier on it locally | the studio | | [preflight](epoch-1/preflight.json): `pass: true` |
| 5 | Commit epoch 1 | the studio | [`CVS9xWhH…`](https://testnet.nearblocks.io/txns/CVS9xWhHXAW2HPSXb7w6JVHeoTjfDoZD5zcXDaqmUqY1) | root `9b274064…`, core `49ff0c57…`, 5 players |
| 6 | Store the epoch's key row, readable only by the pinned verifier for this escrow | the studio | [`63T3jtjy…`](https://testnet.nearblocks.io/txns/63T3jtjyYVFmcSJcyyaMyHCEEZUzLTz1ySVGaE48akNb) | |
| 7 | The enclave verifies the sealed world (OutLayer request 41103) | a stranger | [`HYt9nrCf…`](https://testnet.nearblocks.io/txns/HYt9nrCfAtGe7S8BdaoH22qyZQfS9SMR7geit9BAyk9X) | passed; badge `awaiting-proof` |
| 8 | **NEAR verifies the enclave**: its Intel TDX quote goes to NEAR's DCAP verifier | a stranger | [`DnuNFHa6…`](https://testnet.nearblocks.io/txns/DnuNFHa6q4wDcNv8BuNvubqS88NBgK6sQTirDaAUyZuk) | **green**: `UpToDate` |
| 9 | Each player's proof (their salt and Merkle path) goes back to the game, served only to the key's holder | the studio | | [published](epoch-1/published.json): 5 |
| 10 | **Ada checks her items from her browser**: it signs a proof request, then reads `status()` from NEAR's RPC itself and recomputes the root | Ada | | [screenshot](vault-check.png): leaf ✓, 3-hash path ✓, equals NEAR's root for epoch 1 ✓ |

The check in step 10 is the same code [`web/lib/game/proof.ts`](../../../../web/lib/game/proof.ts) tests against all 24
leaves and the root of life-52e4's released epoch, so the browser and the Rust sealer agree byte for byte.

## Check it yourself

```bash
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"encroe-ember-3924.testnet","method_name":"status","args_base64":"e30="}}' \
  | python3 -c 'import json,sys;s=json.loads(bytes(json.load(sys.stdin)["result"]["result"]));print(s["phase"], s["badge"], "epoch", s["epoch"], "root", s["root"])'
shasum -a 256 web/public/core/embergate.wasm   # 49ff0c57…, the core_sha256 in epoch-1/commitment.json
```

## What it does not show yet

- A public deployment: the game ran on our machine. The hosted game (Vercel, its world in Upstash Redis) seals the
  same way, with `ENCROE_GAME_URL` pointed at it.
- The release of this world and its restoration in a browser: the next step. The grace period is 6 hours, so after
  our last heartbeat anyone may release it.
