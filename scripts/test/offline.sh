#!/usr/bin/env bash
# Offline test suite: CKD vectors, IBE, package and verifier rejection tests, native-vs-WASM determinism, the escrow
# contract's lifecycle (real DCAP bytes) and the Embergate core.
set -euo pipefail
cd "$(dirname "$0")/../.."
scripts/build/all.sh >/dev/null
cargo test -q --release -p encore-crypto -p encore-verifier
(cd contracts/encroe-escrow && cargo test -q)
(cd crates/embergate-core && cargo test -q)
echo "native vs wasm32-wasip2 (wasmtime) determinism on the E1 package:"
SEED=$(cat docs/results/e1/preflight-seed.txt)
./target/release/encore make-input --commitment docs/results/e1/commitment.json --package-b64 docs/results/e1/package.b64 --seed $SEED \
  --released-sig "$(python3 -I -c "import json;print(json.load(open('docs/results/e1/09-verify-release.json'))['sig_hex'])")" > /tmp/encore-test-input.json
env -i PATH="$PATH" wasmtime run target/wasm32-wasip2/release/encore-verifier.wasm < /tmp/encore-test-input.json \
  | python3 -I -c "import json,sys;d=json.load(sys.stdin);e=json.load(open('docs/results/e1/preflight-native.json'));assert d['pass'] and d['transcript_sha256']==e['transcript_sha256'];print('  identical transcript', d['transcript_sha256'])"
