# Game cores: what a game must export to be sealed

Encroe seals a game's **server core**: the code that owns the rules and the players' state, compiled to
WebAssembly. The escrow, the enclave's verifier and the browser that brings a game back never look inside it; they
only call this interface. Any language that compiles to `wasm32` with **no imports** can implement it.

| Game | Language | Genre | Source | Built with |
|---|---|---|---|---|
| Embergate | Rust | crafting world | [`crates/embergate-core`](../crates/embergate-core/src/lib.rs) | `cargo build --target wasm32-unknown-unknown` |
| Matchday | C++20 | football card club (the Ultimate Team genre) | [`matchday/matchday.cpp`](matchday/matchday.cpp) | `zig c++ -target wasm32-freestanding` |
| Neon City | C11 | open-world city economy (the GTA Online genre) | [`neon-city/neon_city.c`](neon-city/neon_city.c) | `zig cc -target wasm32-freestanding` |

`scripts/build/cores.sh` builds the C and C++ cores (with Zig 0.17, which bundles clang and needs no system
toolchain), refuses any core that imports anything, and copies them to `web/public/core`. Their tests, and the same
checks the enclave makes, run on all three in [`web/lib/cores/cores.test.ts`](../web/lib/cores/cores.test.ts).

## The interface

All values are 32-bit integers. The core exports its `memory` and these functions:

| Export | Does |
|---|---|
| `input_ptr() -> u32`, `output_ptr() -> u32` | Where the host writes input (16 KiB) and reads output (1 KiB) |
| `load(len) -> i32` | Replaces the world with the snapshot in the input buffer; returns the player count, or -1 |
| `player_count() -> u32` | |
| `get_key(idx) -> i32` | Writes player `idx`'s 32-byte key to the output buffer; 32, or -1 |
| `get_state(idx) -> i32` | Writes player `idx`'s canonical state to the output buffer; its length, or -1 |
| `trade(from, to, item, qty) -> i32` | Moves `qty` of `item` between players: 0 ok, 1 not enough, 2 bad index, 3 no room |

The snapshot is `count:u32 || (key[32] || n:u32 || (id:u32, qty:u32)*)*`, little-endian. A player's canonical state
is `n:u32 || (id:u32, qty:u32)*` with **ids ascending and no zero quantities**: the escrow commits each player's
state by hash, so two cores that hold the same items must produce the same bytes.

Each game adds its own moves (`gather`, `open_pack`, `job`, ...) returning the same codes, plus 4 (already acted
this tick) and 5 (no such thing). A host that loads the world per request passes time in as a tick and restores each
player's last tick with `restore_tick(idx, tick)`; that bookkeeping is not sealed.

## What the enclave checks

The pinned verifier (`crates/encore-verifier`, sha256 `9c0eb2e7…`) decrypts the sealed package inside an Intel TDX
enclave, loads the snapshot into the core, and checks, from a seed the contract chooses:

1. the core loads exactly the committed number of players;
2. it serves 16 sampled players' states **byte for byte** as committed;
3. across 32 seeded trades of items 1 to 8, the total of every item is **conserved**.

Every observation goes into a transcript hash, so the same seed gives the same verdict anywhere. A core that
misreports one player's items, or creates or destroys an item in a trade, turns its escrow's badge red.
