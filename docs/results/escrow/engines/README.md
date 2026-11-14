# Two more languages: Zig and Go game servers, sealed and verified green (2026-11-14)

The claim: the escrow does not care what a game server is written in. After Rust, C++ and C
([cores](../cores/README.md)), two more games in two more languages pass the same pinned verifier inside an Intel
TDX enclave, through escrows the factory made, with NEAR's DCAP verifier accepting each quote.

| | Starhaul | Orchard |
|---|---|---|
| Language | **Zig** 0.17 | **Go**, compiled with TinyGo 0.44 |
| Genre | space freight economy: mine belts, refine alloy, fly contracts | farm and county fair: tend rows and hives, press cider, win ribbons |
| Source | [`cores/starhaul/starhaul.zig`](../../../../cores/starhaul/starhaul.zig) | [`cores/orchard/main.go`](../../../../cores/orchard/main.go) |
| Core (sha256, size) | `f8a50a17…` (3.5 KB) | `91665f53…` (4.7 KB) |
| Imports | none | none |
| Rebuilt from source | byte-identical (`scripts/build/cores.sh`) | byte-identical |
| Escrow, made by the factory (0 access keys, ever) | [`starhaul.encroe.testnet`](https://testnet.nearblocks.io/txns/C6XQfNJ94J5RFfF3yhRiPcGpzdXW2coV8oc7qsEpVrvT) | [`orchard.encroe.testnet`](https://testnet.nearblocks.io/txns/P8eGdrWEmSND4Xf93xJqoYnL96dv5nCqbQh72QPkVaB) |
| OutLayer's approved images copied in | [`DAwGUes3…`](https://testnet.nearblocks.io/txns/DAwGUes3M5wYdLkeoSWPj2CaiJMmMD6AzC2Yz5zqZv5M) | [`DGA89sbE…`](https://testnet.nearblocks.io/txns/DGA89sbE1fhCCswsYuGpGDode5eCXSh24hBX9yLo3cwv) |
| Pinned verifier, locally, before anything is sent | [`pass: true`](../starhaul/epoch-1/preflight.json) | [`pass: true`](../orchard/epoch-1/preflight.json) |
| Key row to OutLayer's keystore | [`ESti9qAF…`](https://testnet.nearblocks.io/txns/ESti9qAFgQBZkELpuMuiZaaEigQrezwokCspYUATA2as) | [`3NS3fQ4v…`](https://testnet.nearblocks.io/txns/3NS3fQ4vBbxUj1qYNAaGobEBNasSoT6voemEEjDhJ2VW) |
| Epoch 1 committed (8 players) | [`GEHa7z4H…`](https://testnet.nearblocks.io/txns/GEHa7z4HibQX6oJfcqbnYqvonCMVHy7qYMU3Y32NpiBo) | [`CcSPErHv…`](https://testnet.nearblocks.io/txns/CcSPErHvVAZZjFfqjcKi4m1m4tYZ1jHkDbBtFEPUXCEE) |
| Package on FastFS | [`8H6pG5gp…`](https://testnet.nearblocks.io/txns/8H6pG5gpt3MR9Mou1TL3fQomH8s1Ju8NGYXGemdUZU6x) | [`FgHw1VRi…`](https://testnet.nearblocks.io/txns/FgHw1VRiHkzAJEyNYiN9fDXnjSKfRU1gsrsh29SAVL5K) |
| The enclave verifies it | [request 43065](https://testnet.nearblocks.io/txns/5kLZ7F2eh4VSoUGYx9HM3A1Yf3m4BCvLufDM1Td4RVux) | [request 43155](https://testnet.nearblocks.io/txns/KqwiPSvWPeDJ6MnqkrG79NNVE8uyvs7Gqc6Pxebxfvi) |
| NEAR's DCAP verifier accepts the quote | [**green**](https://testnet.nearblocks.io/txns/9M56Vo4RXDH9eNL6ymqePJYvnXvxyPt9QtZbHn1NsacR) | [**green**](https://testnet.nearblocks.io/txns/HLHwjc4VEY7K25aXjr74U7JhXiJekvFJCWTdunskXViD) |

Disclosed: each epoch 1 is eight scripted test players ([`scripts/studio/world.mjs`](../../../../scripts/studio/world.mjs)),
every move made by the core itself. The public worlds on [/play](https://encroe.vercel.app/play) are sealed into the
same escrows by the studio workflow as players arrive.

One refusal came for free: relaying Orchard's quote a second time was refused on chain, "already proven"
([`Auv7DKwo…`](https://testnet.nearblocks.io/txns/Auv7DKwowEM2bCnExtnHVTczZwjiPcuCeJDsohfphf9z)).

## What it took

- **Zig** compiles straight to `wasm32-freestanding`; `--export=` names exactly the interface and the game's moves.
- **Go** needs TinyGo's `wasm-unknown` target (the standard Go compiler's wasm always imports WASI). Two findings:
  `//go:wasmexport` functions trap until `_initialize` runs, and the enclave calls no initializer, so the core uses
  TinyGo's plain `//export`; and TinyGo leaves libc helpers among the exports, so
  [`scripts/build/keep-exports.mjs`](../../../../scripts/build/keep-exports.mjs) keeps only the interface and Binaryen
  drops the rest. `-gc=none` makes any allocation a link error.
- **Unity's C#** is not here: NativeAOT-LLVM's WebAssembly target is still experimental and needs a .NET toolchain
  we have not set up. Any C# core that compiles to wasm32 with no imports and this [interface](../../../../cores/README.md)
  seals the same way.

## Check it yourself

```bash
scripts/build/cores.sh                                    # rebuilds both: same sha256 as each escrow's core_sha256
scripts/near/view.sh starhaul.encroe.testnet status       # badge green, epoch 1
scripts/near/view.sh orchard.encroe.testnet status
cd web && npx vitest run lib/cores                        # both held to the enclave's checks, and their games' rules
```
