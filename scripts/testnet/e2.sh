#!/usr/bin/env bash
# E2: OutLayer confidential verification on testnet. Needs network access to the OutLayer
# testnet API (pubkey for the secret row; attestation records). Run from the repo root.
#   scripts/testnet/e2.sh secret     store the publisher's (k, r) row, gated to the verifier build + this contract
#   scripts/testnet/e2.sh verify     positive run: contract -> OutLayer with the pinned verifier
#   scripts/testnet/e2.sh thief      negative: same secret reference, different build (contract-relayed)
#   scripts/testnet/e2.sh direct     negative: right build, called directly (predecessor = a user)
#   scripts/testnet/e2.sh attest ID  fetch the attestation record of OutLayer request ID
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
API=${OUTLAYER_API:-https://testnet-api.outlayer.ai}
NEAR=./node_modules/.bin/near
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
THIEF_HASH=401a820bfb7ba8a5f1406ffb45e197e144afaaa4557e0133438509e199f41649
VERIFIER_URL="https://test.fastfs.io/$pub/outlayer.testnet/$VERIFIER_HASH.wasm"
THIEF_URL="https://test.fastfs.io/$pub/outlayer.testnet/$THIEF_HASH.wasm"
PROFILE=encore-g1-1
OUT=docs/results/e2
mkdir -p $OUT

limits='{"max_instructions":100000000000,"max_memory_mb":1024,"max_execution_seconds":120}'
deposit_near() {
  local yocto
  yocto=$(scripts/near/view.sh outlayer.testnet estimate_execution_cost "{\"resource_limits\":$limits,\"input_len\":16000}" | tr -d '"')
  python3 -I -c "print(f'{($yocto * 2) / 1e24:.6f} NEAR')"
}
pkg_args() { python3 -I -c "import json;print(json.dumps({'package_b64': open('$OUT/epoch/package.b64').read().strip()}))"; }

case "${1:-}" in
secret)
  # The pubkey depends only on the seed wasm_hash:<hash>:<owner>; secrets_json is sent EMPTY so the
  # closed-source coordinator never sees k or r (the OutLayer CLI uses "{}" the same way).
  body=$(python3 -I -c "import json;print(json.dumps({'accessor':{'type':'WasmHash','hash':'$VERIFIER_HASH'},'owner':'$pub','profile':'$PROFILE','secrets_json':'{}'}))")
  curl -sf -m 60 -X POST "$API/secrets/pubkey" -H 'Content-Type: application/json' -d "$body" | tee $OUT/03-pubkey.json
  pubkey=$(python3 -I -c "import json;print(json.load(open('$OUT/03-pubkey.json'))['pubkey'])")
  ct=$(./target/release/encore outlayer-secret --pubkey "$pubkey" --secret .secrets/e2-secret.json)
  access=$(python3 -I -c "import json;print(json.dumps({'Logic':{'operator':'And','conditions':[{'WasmHash':{'hash':'$VERIFIER_HASH'}},{'Predecessor':{'condition':{'Whitelist':{'accounts':['$e2']}}}}]}}))")
  store=$(python3 -I -c "import json,sys;print(json.dumps({'accessor':{'WasmHash':{'hash':'$VERIFIER_HASH'}},'profile':'$PROFILE','encrypted_secrets_base64':sys.argv[1],'access':json.loads(sys.argv[2]),'vault_id':None}))" "$ct" "$access")
  est=$(scripts/near/view.sh outlayer.testnet estimate_storage_cost "$(python3 -I -c "import json,sys;d=json.loads(sys.argv[1]);d['owner']='$pub';print(json.dumps(d))" "$store")" | tr -d '"')
  dep=$(python3 -I -c "print(f'{($est * 1.2) / 1e24:.6f} NEAR')")
  echo "storage estimate $est yocto; attaching $dep"
  scripts/near/call.sh $pub outlayer.testnet store_secrets "$store" "$dep" "100.0 Tgas" | tee $OUT/04-store-secrets.txt | grep -E "Transaction ID|panicked"
  ;;
verify)
  scripts/near/call.sh $stranger $e2 verify "$(pkg_args)" "$(deposit_near)" "300.0 Tgas" | tee $OUT/05-verify.txt | grep -E "Transaction ID|panicked|request_id|execution_requested"
  scripts/near/view.sh $e2 get_runs | tee $OUT/05-runs.json
  ;;
thief)
  args=$(python3 -I -c "import json;d=json.loads(open('/dev/stdin').read());d.update({'wasm_url':'$THIEF_URL','wasm_hash':'$THIEF_HASH'});print(json.dumps(d))" <<<"$(pkg_args)")
  scripts/near/call.sh $pub $e2 probe "$args" "$(deposit_near)" "300.0 Tgas" | tee $OUT/06-thief.txt | grep -E "Transaction ID|panicked|request_id|execution_requested"
  scripts/near/view.sh $e2 get_runs | tee $OUT/06-runs.json
  ;;
direct)
  input=$(./target/release/encore make-input --commitment $OUT/epoch/commitment.json --package-b64 $OUT/epoch/package.b64 --seed "$(python3 -I -c 'import secrets;print(secrets.token_hex(32))')")
  args=$(python3 -I -c "import json,sys;print(json.dumps({'source':{'WasmUrl':{'url':'$VERIFIER_URL','hash':'$VERIFIER_HASH','build_target':'wasm32-wasip2'}},'resource_limits':json.loads('$limits'),'input_data':sys.argv[1],'secrets_ref':{'profile':'$PROFILE','account_id':'$pub'},'response_format':'Json'}))" "$input")
  scripts/near/call.sh $stranger outlayer.testnet request_execution "$args" "$(deposit_near)" "300.0 Tgas" | tee $OUT/07-direct.txt | grep -E "Transaction ID|panicked|request_id|execution_requested|return value" -A3
  ;;
attest)
  curl -sf -m 60 "$API/attestations/by-request/$2" | tee $OUT/attestation-$2.json
  ;;
*) echo "usage: $0 secret|verify|thief|direct|attest <request_id>"; exit 2 ;;
esac
