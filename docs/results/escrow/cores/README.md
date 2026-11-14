# One escrow, three languages: Rust, C++ and C game servers sealed, verified, released and revived (2026-11-14)

The claim: Encroe does not care what a game server is written in. It seals compiled bytes and judges how they
behave. Three game cores in three languages pass the same pinned verifier inside an Intel TDX enclave, come out of
a released escrow in a browser, and keep running there.

| | Embergate | Matchday | Neon City |
|---|---|---|---|
| Language | Rust | C++20 | C11 |
| Genre | crafting world | football card club (the Ultimate Team genre) | open-world city economy (the GTA Online genre) |
| Built with | `cargo` → `wasm32-unknown-unknown` | `zig c++` (clang) → `wasm32-freestanding` | `zig cc` (clang) → `wasm32-freestanding` |
| Core (sha256) | `49ff0c57…` (7.7 KB) | `f1497517…` (9.5 KB) | `3f4a1e62…` (7.6 KB) |
| Imports | none | none | none |
| Escrow (0 access keys) | [`encroe-kill-827e`](../kill-827e/README.md) | [`encroe-matchday-5d60`](https://testnet.nearblocks.io/address/encroe-matchday-5d60.testnet) | [`encroe-neon-city-19f9`](https://testnet.nearblocks.io/address/encroe-neon-city-19f9.testnet) |
| Locked | | [`6WGR7Vnb…`](https://testnet.nearblocks.io/txns/6WGR7VnbdWxMxVRGsc8rL1pRpTgjZWK7APZL7pr3aKcG) | [`GWizB4Bu…`](https://testnet.nearblocks.io/txns/GWizB4Bu1tXnF7196TjiNccuPQD1Vxf9Xzk8vSroaWet) |
| Sealed (8 scripted players) and committed | | [`ENTBPY8t…`](https://testnet.nearblocks.io/txns/ENTBPY8t4TNedquAbW7kjpBZ3U15Bi1ZS3dxPQtQamw9) | [`5VKXcUpn…`](https://testnet.nearblocks.io/txns/5VKXcUpnBT5uBdXWLMqV82rdCGcaMCS4hPEtbqL8AHEP) |
| Package on FastFS | | [`9vdQ1kXq…`](https://testnet.nearblocks.io/txns/9vdQ1kXqPaEhevZSDNvGUoAUqwGAkqFvDBF83DUvmxeX) | [`DZ33SyuH…`](https://testnet.nearblocks.io/txns/DZ33SyuHq2MNhGqh467uTjMUn9JfsdNECsrvEgeAFuz5) |
| Pinned verifier, locally | `pass: true` | [`pass: true`](../matchday-5d60/epoch-1/preflight.json) | [`pass: true`](../neon-city-19f9/epoch-1/preflight.json) |
| The enclave verifies it | request 41193 | [request 41461](https://testnet.nearblocks.io/txns/CHcpU9ws1DgirHYX2iYNQqfTr3y28EwnanCB64EDF28m) | [request 41492](https://testnet.nearblocks.io/txns/38KoTRjfEpnYeuaRaxzveRSTKPsYtV7Csv8y4C47keNm) |
| NEAR's DCAP verifier accepts the quote | green | [**green**](https://testnet.nearblocks.io/txns/FEz37Us2uvDA7NJL21rbY2w6eryiBzPWzxidyfYKa8mb) | [**green**](https://testnet.nearblocks.io/txns/HRGDG6A5j29HCVXcMmZJtUapecQ7hvUzraxs2Wrt5w5t) |
| A stranger releases it | | [`79K4FCGT…`](https://testnet.nearblocks.io/txns/79K4FCGTBtB19ekxGhSLtdCqBtibxQBaa3pVqHmjQxcD) | [`9fBPAq4p…`](https://testnet.nearblocks.io/txns/9fBPAq4pduHgJqoU3coN4sPsemXHAYzfCDGhHcHJMZB2) |
| Revived in a browser: all eight checks | [yes](../kill-827e/revive.png) | [yes](../matchday-5d60/revive.png) | [yes](../neon-city-19f9/revive.png) |
| Played on, in the browser, on the revived core | [a new player gathers](../kill-827e/play-on.png) | [a new club opens a pack, plays a match](../matchday-5d60/play-on.png) | [a new driver works a delivery](../neon-city-19f9/play-on.png) |

Each run is the same contract build (`08d9174f…`), locked before anything was sealed, with a two-minute grace the
studio let lapse (a disclosed simulation of a studio going silent). The worlds were played by
[`scripts/studio/world.mjs`](../../../../scripts/studio/world.mjs), which runs every move through the core itself;
its players are scripted, with random keys.

## What went wrong first, and is on chain too

- **`encroe-matchday-b565`.** The first C++ build carried 15 KB of debug info (and this machine's paths), which
  pushed the enclave's input past 32 KB. Our runbook still priced OutLayer's fee for 16 KB, so OutLayer refused the
  request ([`BUonAWWT…`](https://testnet.nearblocks.io/txns/BUonAWWTD3nGt5DjqwWKen3u3rbddkSvXC7eBbXJkM93)) and the
  contract recorded the run with no verdict, neither pass nor fail. Fixed twice: the cores are built with no debug
  info (and the build refuses one that carries a local path), and the fee is sized from the real package.
- **The testnet faucet rate-limited account creation**, so `encroe-neon-city-19f9` was funded by our relayer
  instead (`FUND_FROM`), then topped up with 2 NEAR after its first `refresh_measurements` ran out of storage
  balance; a locked account still accepts deposits.

## Check it yourself

```bash
scripts/build/cores.sh        # rebuild both cores with Zig 0.17: the same sha256 as above
cd web && npx vitest run lib/cores   # all three cores held to the enclave's checks (64 players, 400 seeded trades)
```

Then open `/revive?escrow=encroe-neon-city-19f9.testnet` (or `matchday-5d60`) on the site and press
**Bring it back**.
