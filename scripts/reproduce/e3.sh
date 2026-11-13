#!/usr/bin/env bash
# E3: third-party reproduction after the authorized public release, against the OutLayer-attested run.
# Public inputs only: NEAR testnet state (released key, recorded run + seed), the published commitment
# and sealed package, the verifier fetched by hash from FastFS, and the OutLayer attestation record.
# Needs: curl, python3, wasmtime, `cargo build --release -p encore-cli -p encore-attest`.
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTRACT=${CONTRACT:-encore-e2-6b4dad.testnet}
PUBLISHER=${PUBLISHER:-encore-pub-6b4dad.testnet}
REQUEST_ID=${REQUEST_ID:-25728}
API=${OUTLAYER_API:-https://testnet-api.outlayer.ai}
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
D=docs/results/e2/epoch
TMP=$(mktemp -d)

echo "1. contract is locked, released, and recorded the attested run"
curl -s -m 20 https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$CONTRACT\"}}" \
  | python3 -I -c "import json,sys;k=json.load(sys.stdin)['result']['keys'];print('   access keys:',k);assert k==[]"
scripts/near/view.sh $CONTRACT get_state > $TMP/state.json
scripts/near/view.sh $CONTRACT get_runs > $TMP/runs.json
BY=$(python3 -I -c "import json;print(json.load(open('$TMP/state.json'))['released']['big_y'])")
BC=$(python3 -I -c "import json;print(json.load(open('$TMP/state.json'))['released']['big_c'])")
SEED=$(python3 -I -c "import json;r=[x for x in json.load(open('$TMP/runs.json')) if x['kind']=='verify' and x['accepted']][0];print(r['seed'])")
python3 -I -c "import json;r=[x for x in json.load(open('$TMP/runs.json')) if x['kind']=='verify' and x['accepted']][0];open('$TMP/attested-output.json','w').write(r['output'])"

echo "2. released key verifies for (contract, path) and opens the exact committed package"
./target/release/encore verify-release --commitment $D/commitment.json --big-y "$BY" --big-c "$BC" --key-mode pv_identity > $TMP/release.json
SIG=$(python3 -I -c "import json;d=json.load(open('$TMP/release.json'));assert d['pairing_e_sig_g2_eq_e_Q_pk'];print(d['sig_hex'])")
./target/release/encore open --commitment $D/commitment.json --package $D/package.sealed --sig $SIG

echo "3. OutLayer attestation of the pre-release run is genuine and binds this output"
if ! curl -sf -m 60 "$API/attestations/by-request/$REQUEST_ID" > $TMP/attestation.json; then
  # The quote is self-verifying, so the saved record is checked the same way (Intel PCS, on-chain measurements).
  echo "   OutLayer API unreachable: using the saved record docs/results/e2/attestation-$REQUEST_ID.json"
  cp "docs/results/e2/attestation-$REQUEST_ID.json" $TMP/attestation.json
fi
scripts/near/view.sh worker.outlayer.testnet get_approved_measurements > $TMP/measurements.json
./target/release/encore-attest $TMP/attestation.json $TMP/measurements.json "" $TMP/attested-output.json 2>/dev/null \
  | python3 -I -c "import json,sys;d=json.load(sys.stdin);print('   tcb',d['tcb_status'],'| approved',d['measurements_in_approved_list'],'| report_data binds task',d['report_data_binds_task_fields'],'| output bound',d['output_hash_matches_contract_output'],'| wasm',d['executed_wasm_sha256'][:12])" \
  || ./target/release/encore-attest $TMP/attestation.json $TMP/measurements.json

echo "4. same verifier build, outside OutLayer, release mode, same seed"
curl -sf -m 120 -o $TMP/verifier.wasm "https://test.fastfs.io/$PUBLISHER/outlayer.testnet/$VERIFIER_HASH.wasm"
test "$(shasum -a 256 $TMP/verifier.wasm | cut -c1-64)" = "$VERIFIER_HASH" && echo "   verifier sha256 ok"
./target/release/encore make-input --commitment $D/commitment.json --package-b64 $D/package.b64 --seed $SEED --released-sig $SIG > $TMP/input.json
env -i PATH="$PATH" wasmtime run $TMP/verifier.wasm < $TMP/input.json > $TMP/reproduced.json
python3 -I - $TMP/reproduced.json $TMP/attested-output.json <<'EOF'
import json, sys
rep, att = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
diff = sorted(k for k in set(rep) | set(att) if rep.get(k) != att.get(k))
print("   attested (OutLayer, secret mode):", att["mode"], att["pass"], att["transcript_sha256"])
print("   reproduced (wasmtime, release mode):", rep["mode"], rep["pass"], rep["transcript_sha256"])
print("   fields that differ:", diff)
assert rep["pass"] and diff == ["mode"], "reproduction differs beyond the mode label"
print("REPRODUCED")
EOF
