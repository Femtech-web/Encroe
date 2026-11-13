# The studio goes silent; the game comes back in a browser and play goes on (2026-11-14)

The claim: once a studio stops its heartbeat, **anyone** can release its escrow, and **anyone** can bring the game
back from public data alone (the escrow on NEAR, the sealed package on FastFS) and keep playing it, with no tool,
server, key or permission from the studio.

- **The world**: Embergate's live world (5 players: Ada played by hand, four scripted test players, as in
  [ember-3924](../ember-3924/README.md)), sealed with the core `49ff0c57…`.
- **The escrow**: `encroe-kill-827e.testnet`, the same contract build (`08d9174f…`), locked before anything was
  sealed. Grace: **2 minutes**. The studio never sends a heartbeat, which is how this run simulates a studio that
  disappears; we disclose it.
- **The studio's side**: [`scripts/studio/bot.sh pool 1`](../../../../scripts/studio/bot.sh). The bot stopped
  after the deploy because our dev server had exited; we restarted the server and finished the seal with
  `bot.sh seal` (no player proofs published).
- **The player's side**: [`web/app/revive`](../../../../web/app/revive), which runs
  [`web/lib/encroe/revive.ts`](../../../../web/lib/encroe/revive.ts) in the browser.

| # | Step | By | Transaction | Result |
|---|---|---|---|---|
| 1 | Create, deploy, lock | | [`7GWwjyJ1…`](https://testnet.nearblocks.io/txns/7GWwjyJ1ghTnvmzi1jbqi3ZyWTjQiiNYiL3uZWGh7FEy), [`GHYumZsd…`](https://testnet.nearblocks.io/txns/GHYumZsd5zMh1pzws1VnL6NpWWr3kzLmfk6H8CU5FLJT), [`CjVYcnbc…`](https://testnet.nearblocks.io/txns/CjVYcnbcJ79PW8JMTRUUfX4H3fBZQFAtWBQQcwJDxEEk) | **0 access keys** |
| 2 | Copy OutLayer's approved enclave images | a stranger | [`AhufQV3L…`](https://testnet.nearblocks.io/txns/AhufQV3LhvnL2Aojaa12s7NpPqB8jKNBpoqeScKRywNU) | 129 images |
| 3 | Seal the live world, run the pinned verifier locally, commit epoch 1 | the studio | [`4gqFBSLq…`](https://testnet.nearblocks.io/txns/4gqFBSLqdovSa587HGRw1FyFuY3G1kn8KXLKnVeN9WAT) | [preflight](epoch-1/preflight.json) `pass: true`; 5 players |
| 4 | **Put the sealed package on NEAR** (FastFS) | the studio | [`GGzmFbCp…`](https://testnet.nearblocks.io/txns/GGzmFbCpJ8rFXYdhqhe9Sdzb5XwtzHkvcsXZ1q3SCsUg) | [served by FastFS](epoch-1/package-url.txt) at `<studio>/<escrow>/<pkg_sha256>.sealed` |
| 5 | Store the epoch's key row for the pinned verifier | the studio | [`8df8qzEd…`](https://testnet.nearblocks.io/txns/8df8qzEd1b6STBnTnKoJfq5aWqPTpN3eTgNEJzvE5bob) | |
| 6 | The enclave verifies the sealed world (OutLayer request 41193) | a stranger | [`5DMVmpVp…`](https://testnet.nearblocks.io/txns/5DMVmpVpkmFo3j4GFeBDQBZ19rjJq6NppjotC3bm1prW) | passed |
| 7 | NEAR's DCAP verifier checks the enclave's quote | a stranger | [`Aj7jHsQo…`](https://testnet.nearblocks.io/txns/Aj7jHsQovct9z7Uf6PFPWuSNB4wrqMjCQV9kWgqTYe7J) | **green**: `UpToDate` |
| 8 | Release while the grace still runs | a stranger | [`KcRxiYe5…`](https://testnet.nearblocks.io/txns/KcRxiYe5MT96RmDFCc2kKvVmEHhydQU4QL1qX1AT6qv) | **refused**: `release condition not met: publisher heartbeat is live` |
| 9 | **Release** after the silence; NEAR's MPC network publishes the key | a stranger | [`6voVxsnV…`](https://testnet.nearblocks.io/txns/6voVxsnVmfzRnkmcv51HFth4SSaMMFQ21AJedGnphtZ6) | phase `released` |
| 10 | **Bring it back in a browser** | anyone | | [screenshot](revive.png): all eight checks pass (below) |
| 11 | **Play on**: a new player joins the revived world, gathers and plays | anyone | | [screenshot](play-on.png): the same game, run by the browser on the sealed core; the game's server is not called |

What the browser checks in step 10, from public data only:

1. it reads `get_state` from NEAR's RPC: released, by `encore-stranger-6b4dad.testnet`;
2. the app id derived from the escrow's account and path is the committed one: the key is this contract's;
3. the release is NEAR's MPC network's BLS signature on that identity: `e(sig, g2) = e(H(pk‖app id), pk)`;
4. the package fetched from FastFS hashes to the committed `pkg_sha256`;
5. the released key opens it (the sealed key recovered from `e(sig, U)`, then AES-256-GCM);
6. its server core hashes to the committed `core_sha256`, the build the enclave verified;
7. the root over every player's leaf is the committed root;
8. the core compiles in the browser with **no imports**: it cannot reach anything but its own memory.

The browser code is checked against the Rust tools on real data:
[`release.test.ts`](../../../../web/lib/encroe/release.test.ts) and
[`revive.test.ts`](../../../../web/lib/encroe/revive.test.ts) open life-52e4's released epoch, and refuse a tampered
package, an unreleased escrow and a release made for another contract.

## Check it yourself

Open `/revive?escrow=encroe-kill-827e.testnet` on the site (or `http://localhost:3000` from `web/`) and press
"Bring it back".
