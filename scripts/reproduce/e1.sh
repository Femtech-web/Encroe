#!/usr/bin/env bash
# Third-party reproduction of E1 (+ the E3 core) from public data only: the released CKD response
# on chain, the published commitment and sealed package, and the verifier build pinned by hash.
# Needs: curl, python3, wasmtime, and `cargo build --release -p encore-cli` (or the binary).
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTRACT=${CONTRACT:-encore-e1-6b4dad.testnet}
PUBLISHER=${PUBLISHER:-encore-pub-6b4dad.testnet}
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
D=docs/results/e1
TMP=$(mktemp -d)

echo "1. contract state (released CKD response) from NEAR testnet"
scripts/near/view.sh $CONTRACT get_state > $TMP/state.json
BY=$(python3 -I -c "import json;print(json.load(open('$TMP/state.json'))['released']['big_y'])")
BC=$(python3 -I -c "import json;print(json.load(open('$TMP/state.json'))['released']['big_c'])")

echo "2. verify e(sig,G2) == e(H(pk||app_id(contract,path)), pk) and that app_id binds the contract"
./target/release/encore verify-release --commitment $D/commitment.json --big-y "$BY" --big-c "$BC" --key-mode pv_identity | tee $TMP/release.json
SIG=$(python3 -I -c "import json;print(json.load(open('$TMP/release.json'))['sig_hex'])")

echo "3. decrypt the committed package with the released key; check committed hashes"
./target/release/encore open --commitment $D/commitment.json --package $D/package.sealed --sig $SIG

echo "4. fetch the verifier build by hash from FastFS and re-run the deterministic test in release mode"
curl -sf -m 120 -o $TMP/verifier.wasm "https://test.fastfs.io/$PUBLISHER/outlayer.testnet/$VERIFIER_HASH.wasm"
test "$(shasum -a 256 $TMP/verifier.wasm | cut -c1-64)" = "$VERIFIER_HASH" && echo "   verifier sha256 ok"
./target/release/encore make-input --commitment $D/commitment.json --package-b64 $D/package.b64 --seed "$(cat $D/preflight-seed.txt)" --released-sig $SIG > $TMP/input.json
env -i PATH="$PATH" wasmtime run $TMP/verifier.wasm < $TMP/input.json > $TMP/out.json
python3 -I - $TMP/out.json $D/preflight-native.json <<'EOF'
import json, sys
post, pre = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
print("   release-mode:", post["pass"], post["transcript_sha256"])
print("   pre-release :", pre["pass"], pre["transcript_sha256"])
assert post["pass"] and post["transcript_sha256"] == pre["transcript_sha256"], "transcript mismatch"
print("REPRODUCED")
EOF
