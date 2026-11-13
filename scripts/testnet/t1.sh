#!/usr/bin/env bash
# T1 on testnet: Encore where an OutLayer verification run is accepted only after its TDX quote is
# verified on NEAR (contracts/encore-t1). Needs OutLayer's testnet API (secret pubkey, attestations).
#
#   scripts/testnet/t1.sh deploy       create t1.<pub> and deploy encore-t1, pinning the verifier build, NEAR's
#                                      DCAP verifier and OutLayer's worker registry
#   scripts/testnet/t1.sh seal         seal a new epoch to (t1.<pub>, encore/g1/1) and commit it
#   scripts/testnet/t1.sh refresh      copy OutLayer's approved worker images into the contract
#   scripts/testnet/t1.sh secret       store the publisher's (k, r) row, gated to the verifier build + t1.<pub>
#   scripts/testnet/t1.sh verify       a stranger asks for the verification run (accepted: false until proven)
#   scripts/testnet/t1.sh prove <id>   fetch OutLayer request <id>'s attestation and relay its quote with Intel
#                                      PCS collateral; NEAR's DCAP verifier decides (accepted: true only then)
#   scripts/testnet/t1.sh status
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
API=${OUTLAYER_API:-https://testnet-api.outlayer.ai}
NEAR=./node_modules/.bin/near
MPC=v1.signer-prod.testnet
DCAP=tee-verifier-2026-07-22.testnet
REGISTRY=worker.outlayer.testnet
T1="t1.$pub"
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
VERIFIER_URL="https://test.fastfs.io/$pub/outlayer.testnet/$VERIFIER_HASH.wasm"
PROFILE=encore-t1-1
WASM=contracts/encore-t1/target/near/encore_t1.wasm
OUT=docs/results/t1
mkdir -p "$OUT"

limits='{"max_instructions":100000000000,"max_memory_mb":1024,"max_execution_seconds":120}'
deposit_near() {
  local yocto
  yocto=$(scripts/near/view.sh outlayer.testnet estimate_execution_cost "{\"resource_limits\":$limits,\"input_len\":16000}" | tr -d '"')
  python3 -I -c "print(f'{($yocto * 2) / 1e24:.6f} NEAR')"
}
pkg_args() { python3 -I -c "import json;print(json.dumps({'package_b64': open('$OUT/epoch/package.b64').read().strip()}))"; }
show() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|panicked|request_id|T1|not proven|succeeded|Error" | head -6; }

case "${1:-}" in
deploy)
  (cd contracts/encore-t1 && ../../node_modules/.bin/cargo-near near build non-reproducible-wasm >/dev/null)
  shasum -a 256 "$WASM" | tee "$OUT/contract-sha256.txt"
  if ! scripts/near/view.sh "$T1" get_state >/dev/null 2>&1 || [ -z "$(scripts/near/view.sh "$T1" get_state | grep owner || true)" ]; then
    "$NEAR" account create-account fund-myself "$T1" '5 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
      sign-as "$pub" network-config testnet sign-with-legacy-keychain send 2>&1 | show
  fi
  args=$(python3 -I -c "import json;print(json.dumps({'owner':'$pub','mpc':'$MPC','domain_id':2,'key_mode':'pv_identity','path':'encore/g1/1','grace_ns':86400000000000,'outlayer':'outlayer.testnet','verifier_url':'$VERIFIER_URL','verifier_hash':'$VERIFIER_HASH','secret_profile':'$PROFILE','dcap_verifier':'$DCAP','registry':'$REGISTRY'}))")
  "$NEAR" contract deploy "$T1" use-file "$WASM" with-init-call new json-args "$args" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
    network-config testnet sign-with-legacy-keychain send 2>&1 | tee "$OUT/01-deploy.txt" | show
  ;;
seal)
  ckd=$(scripts/near/view.sh "$MPC" public_key '{"domain_id":2}' | tr -d '"')
  ./target/release/encore seal --predecessor "$T1" --path encore/g1/1 --domain-id 2 --ckd-pk "$ckd" --game g1 --epoch 1 \
    --core crates/encore-core-game/target/wasm32-unknown-unknown/release/encore_core_game.wasm \
    --out "$OUT/epoch" --secret-out .secrets/t1-secret.json >/dev/null
  # The contract's Commitment: the sealed key's (u, v) flattened, as E2 committed it.
  args=$(python3 -I -c "
import json
c=json.load(open('$OUT/epoch/commitment.json'))
keys=('game','epoch','ckd_pk','app_id','pkg_sha256','root','core_sha256','players')
d={k:c[k] for k in keys}; d['sealed_u']=c['sealed_key']['u']; d['sealed_v']=c['sealed_key']['v']
print(json.dumps({'commitment':d}))")
  scripts/near/call.sh "$pub" "$T1" commit "$args" "0 NEAR" "50.0 Tgas" | tee "$OUT/02-commit.txt" | show
  ;;
refresh)
  scripts/near/call.sh "$stranger" "$T1" refresh_measurements '{}' "0 NEAR" "200.0 Tgas" | tee "$OUT/03-refresh.txt" | show
  scripts/near/view.sh "$T1" get_state | python3 -I -c 'import json,sys;print("approved images:", json.load(sys.stdin)["approved_images"])'
  ;;
secret)
  body=$(python3 -I -c "import json;print(json.dumps({'accessor':{'type':'WasmHash','hash':'$VERIFIER_HASH'},'owner':'$pub','profile':'$PROFILE','secrets_json':'{}'}))")
  curl -sf -m 60 -X POST "$API/secrets/pubkey" -H 'Content-Type: application/json' -d "$body" | tee "$OUT/04-pubkey.json"; echo
  pubkey=$(python3 -I -c "import json;print(json.load(open('$OUT/04-pubkey.json'))['pubkey'])")
  ct=$(./target/release/encore outlayer-secret --pubkey "$pubkey" --secret .secrets/t1-secret.json)
  access=$(python3 -I -c "import json;print(json.dumps({'Logic':{'operator':'And','conditions':[{'WasmHash':{'hash':'$VERIFIER_HASH'}},{'Predecessor':{'condition':{'Whitelist':{'accounts':['$T1']}}}}]}}))")
  store=$(python3 -I -c "import json,sys;print(json.dumps({'accessor':{'WasmHash':{'hash':'$VERIFIER_HASH'}},'profile':'$PROFILE','encrypted_secrets_base64':sys.argv[1],'access':json.loads(sys.argv[2]),'vault_id':None}))" "$ct" "$access")
  est=$(scripts/near/view.sh outlayer.testnet estimate_storage_cost "$(python3 -I -c "import json,sys;d=json.loads(sys.argv[1]);d['owner']='$pub';print(json.dumps(d))" "$store")" | tr -d '"')
  dep=$(python3 -I -c "print(f'{($est * 1.2) / 1e24:.6f} NEAR')")
  scripts/near/call.sh "$pub" outlayer.testnet store_secrets "$store" "$dep" "100.0 Tgas" | tee "$OUT/05-store-secrets.txt" | show
  ;;
verify)
  scripts/near/call.sh "$stranger" "$T1" verify "$(pkg_args)" "$(deposit_near)" "300.0 Tgas" | tee "$OUT/06-verify.txt" | show
  scripts/near/view.sh "$T1" get_runs | tee "$OUT/06-runs.json" | python3 -I -c '
import json,sys
for i,r in enumerate(json.load(sys.stdin)): print(i, r["kind"], "output_ok", r["output_ok"], "t1", r["t1"], "accepted", r["accepted"])'
  ;;
prove)
  id=${2:?request id}
  curl -sf -m 60 "$API/attestations/by-request/$id" > "$OUT/attestation-$id.json"
  scripts/near/view.sh "$REGISTRY" get_approved_measurements > "$OUT/approved-measurements.json"
  ENCORE_VERIFY_QUOTE_ARGS="$OUT/verify-quote-$id.b64" ./target/release/encore-attest "$OUT/attestation-$id.json" "$OUT/approved-measurements.json" \
    | tee "$OUT/attestation-$id-check.json" | python3 -I -c 'import json,sys;d=json.load(sys.stdin);print("off-chain:", d["tcb_status"], "| binds task", d["report_data_binds_task_fields"])'
  index=$(scripts/near/view.sh "$T1" get_runs | python3 -I -c 'import json,sys;r=json.load(sys.stdin);print(max(i for i,x in enumerate(r) if x["kind"]=="verify"))')
  python3 -I -c "
import json
a=json.load(open('$OUT/attestation-$id.json'))
print(json.dumps({'index':$index,'attestation':a,'quote':a['tdx_quote'],'collateral':open('$OUT/verify-quote-$id.b64.collateral').read().strip()}))" > "$OUT/prove-args.json"
  scripts/near/call.sh "$stranger" "$T1" prove_run "$(cat "$OUT/prove-args.json")" "0 NEAR" "300.0 Tgas" | tee "$OUT/07-prove.txt" | show
  "$0" status
  ;;
status)
  scripts/near/view.sh "$T1" get_runs | python3 -I -c '
import json,sys
for i,r in enumerate(json.load(sys.stdin)): print("run", i, r["kind"], "| output_ok", r["output_ok"], "| t1", r["t1"], "| accepted", r["accepted"])'
  ;;
*) sed -n '2,14p' "$0"; exit 2 ;;
esac
