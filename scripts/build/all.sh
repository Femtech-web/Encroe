#!/usr/bin/env bash
# Builds every artefact the experiments use and prints their SHA-256.
set -euo pipefail
cd "$(dirname "$0")/../.."
(cd crates/encore-core-game && cargo build -q --release --target wasm32-unknown-unknown \
  && cargo build -q --release --target wasm32-unknown-unknown --features broken --target-dir target-broken)
(cd crates/embergate-core && cargo build -q --release --target wasm32-unknown-unknown)
mkdir -p web/public/core && cp crates/embergate-core/target/wasm32-unknown-unknown/release/embergate_core.wasm web/public/core/embergate.wasm
cargo build -q --release -p encore-cli -p encore-attest
cargo build -q --release --target wasm32-wasip2 -p encore-verifier -p encore-thief
(cd contracts/encore-poc && ../../node_modules/.bin/cargo-near near build non-reproducible-wasm >/dev/null)
shasum -a 256 crates/encore-core-game/target/wasm32-unknown-unknown/release/encore_core_game.wasm web/public/core/embergate.wasm \
  target/wasm32-wasip2/release/encore-verifier.wasm target/wasm32-wasip2/release/encore-thief.wasm \
  contracts/encore-poc/target/near/encore_poc.wasm
