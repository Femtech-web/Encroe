#!/usr/bin/env bash
# One game's escrow on testnet (contracts/encroe-escrow), end to end. Every step's output and transaction is
# kept in docs/results/escrow/<name>/ (and one line per step in its log.jsonl).
#
#   scripts/testnet/escrow.sh deploy <name> <grace_s>  a faucet account encroe-<name>.testnet; deploy and init
#                                                     the escrow; then delete its only key: locked before
#                                                     anything is sealed
#   scripts/testnet/escrow.sh refresh                  copy OutLayer's approved worker images (anyone)
#   scripts/testnet/escrow.sh seal <epoch> [broken]    seal the game core (or its broken build), run the pinned
#                                                     verifier on it locally, and commit it (a failing build is
#                                                     committed only when asked for: broken). ENCROE_CORE picks
#                                                     the core; PLAYERS_FILE seals a live world's players
#   scripts/testnet/escrow.sh package <epoch>          put the sealed package on FastFS, on NEAR itself, at
#                                                     test.fastfs.io/<studio>/<escrow>/<pkg_sha256>.sealed, so
#                                                     opening the game needs no studio server (seal does this)
#   scripts/testnet/escrow.sh secret <epoch>           store that epoch's (k, r) row, gated to the pinned
#                                                     verifier build and this escrow
#   scripts/testnet/escrow.sh verify <epoch>           a stranger asks the enclave to verify the sealed package
#   scripts/testnet/escrow.sh prove <request> [run]    relay request <request>'s quote for run [run] (default:
#                                                     the latest); NEAR's DCAP verifier decides
#   scripts/testnet/escrow.sh heartbeat                the studio's sign of life
#   scripts/testnet/escrow.sh release                  a stranger asks for the key (refused while the studio lives)
#   scripts/testnet/escrow.sh open <epoch>             anyone: recover the released key from the chain, decrypt
#                                                     the package, check every committed hash
#   scripts/testnet/escrow.sh watch                    wait for the studio's silence, then release (a stranger)
#                                                     and open the package (released by someone else: just open)
#   scripts/testnet/escrow.sh status
#
# The escrow in use is docs/results/escrow/current (set by deploy), or ESCROW_NAME=<name>.
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
API=${OUTLAYER_API:-https://testnet-api.outlayer.ai}
NEAR=./node_modules/.bin/near
MPC=v1.signer-prod.testnet
DCAP=tee-verifier-2026-07-22.testnet
REGISTRY=worker.outlayer.testnet
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
VERIFIER_URL="https://test.fastfs.io/$pub/outlayer.testnet/$VERIFIER_HASH.wasm"
WASM=contracts/encroe-escrow/target/near/encroe_escrow.wasm
CORE=${ENCROE_CORE:-crates/encore-core-game/target/wasm32-unknown-unknown/release/encore_core_game.wasm}
CORE_BROKEN=crates/encore-core-game/target-broken/wasm32-unknown-unknown/release/encore_core_game.wasm
ROOT=docs/results/escrow
mkdir -p "$ROOT" .secrets/escrow

NAME=${ESCROW_NAME:-$( [ "${1:-}" = deploy ] && echo "${2:?name}" || cat "$ROOT/current" 2>/dev/null || true)}
[ -n "$NAME" ] || { echo "no escrow yet: scripts/testnet/escrow.sh deploy <name> <grace_s>" >&2; exit 2; }
# A factory escrow is <name>.encroe.testnet: ESCROW_ACCOUNT names it (its key path and profile use <name> alike).
ESCROW=${ESCROW_ACCOUNT:-encroe-$NAME.testnet}
KEYPATH="encroe/$NAME/1"
PROFILE="encroe-$NAME"
OUT="$ROOT/$NAME"
mkdir -p "$OUT"

plain() { sed 's/\x1b\[[0-9;]*m//g'; }
# Record a step: its full output to $OUT/<step>.txt, one JSON line with the transaction and any refusal.
record() {
  local step=$1 file="$OUT/$1.txt"
  plain > "$file"
  python3 -I - "$step" "$file" "$OUT/log.jsonl" <<'PY'
import json, re, sys, time
step, path, log = sys.argv[1:]
text = open(path).read()
tx = re.findall(r"Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})", text)
err = re.search(r"Smart contract panicked: ([^\n\"]+)", text)
req = re.search(r'request_id\\?"?:\s*(\d+)', text)
entry = {"at": int(time.time()), "step": step, "tx": tx[-1] if tx else None,
         "refused": err.group(1).strip() if err else None, "request_id": int(req.group(1)) if req else None}
open(log, "a").write(json.dumps(entry) + "\n")
print(json.dumps(entry))
PY
}
# OutLayer's price for one run: compute plus a hold on input beyond 32 KiB. The contract's input carries the whole
# package, so it is sized from the real one (twice its base64, generously), not a fixed guess.
deposit_near() {
  local yocto len=${1:-16000}
  yocto=$(scripts/near/view.sh outlayer.testnet estimate_execution_cost "{\"resource_limits\":{\"max_instructions\":100000000000,\"max_memory_mb\":1024,\"max_execution_seconds\":120},\"input_len\":$len}" | tr -d '"')
  python3 -I -c "print(f'{($yocto * 2) / 1e24:.6f} NEAR')"
}
pkg_args() { python3 -I -c "import json;print(json.dumps({'package_b64': open('$OUT/epoch-$1/package.b64').read().strip()}))"; }

case "${1:-}" in
deploy)
  grace=${3:?grace seconds}
  (cd contracts/encroe-escrow && ../../node_modules/.bin/cargo-near near build non-reproducible-wasm >/dev/null)
  shasum -a 256 "$WASM" | awk '{print $1}' > "$OUT/code-sha256.txt"
  # The testnet faucet funds the account; when it rate-limits, FUND_FROM=<account> pays 5 NEAR instead (the
  # contract's storage). Either way the account's only key is deleted below.
  if [ -n "${FUND_FROM:-}" ]; then
    "$NEAR" account create-account fund-myself "$ESCROW" '5 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
      sign-as "$FUND_FROM" network-config testnet sign-with-legacy-keychain send 2>&1 | record 01-create
  else
    "$NEAR" account create-account sponsor-by-faucet-service "$ESCROW" autogenerate-new-keypair save-to-legacy-keychain \
      network-config testnet create 2>&1 | record 01-create
  fi
  sleep 5
  args=$(python3 -I -c "import json;print(json.dumps({'owner':'$pub','mpc':'$MPC','domain_id':2,'key_mode':'pv_identity','path':'$KEYPATH','grace_ns':$grace*10**9,'outlayer':'outlayer.testnet','verifier_url':'$VERIFIER_URL','verifier_hash':'$VERIFIER_HASH','secret_profile':'$PROFILE','dcap_verifier':'$DCAP','registry':'$REGISTRY'}))")
  "$NEAR" contract deploy "$ESCROW" use-file "$WASM" with-init-call new json-args "$args" prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | record 02-deploy
  # Delete the keys NEAR reports for the account, not one read from a local file: a failed earlier attempt can
  # leave a stale key file under the same name.
  key=$(curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$ESCROW\"}}" \
    | python3 -I -c 'import json,sys;print(",".join(k["public_key"] for k in json.load(sys.stdin)["result"]["keys"]))')
  "$NEAR" account delete-keys "$ESCROW" public-keys "$key" network-config testnet sign-with-legacy-keychain send 2>&1 | record 03-lock
  echo "$NAME" > "$ROOT/current"
  printf 'ESCROW=%s\nOWNER=%s\nPATH_=%s\nGRACE_S=%s\nCODE_SHA256=%s\n' "$ESCROW" "$pub" "$KEYPATH" "$grace" "$(cat "$OUT/code-sha256.txt")" > "$OUT/env"
  "$0" keys
  ;;
keys)
  curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$ESCROW\"}}" \
    | python3 -I -c 'import json,sys;print(sys.argv[1], "access keys:", len(json.load(sys.stdin)["result"]["keys"]))' "$ESCROW"
  ;;
refresh)
  scripts/near/call.sh "$stranger" "$ESCROW" refresh_measurements '{}' "0 NEAR" "200.0 Tgas" | record 04-refresh
  scripts/near/view.sh "$ESCROW" get_state | python3 -I -c 'import json,sys;print("approved images:", json.load(sys.stdin)["approved_images"])'
  ;;
seal)
  epoch=${2:?epoch}; core=$CORE; [ "${3:-}" = broken ] && core=$CORE_BROKEN
  ckd=$(scripts/near/view.sh "$MPC" public_key '{"domain_id":2}' | tr -d '"')
  ./target/release/encore seal --predecessor "$ESCROW" --path "$KEYPATH" --domain-id 2 --ckd-pk "$ckd" --game "$NAME" \
    --epoch "$epoch" --core "$core" ${PLAYERS_FILE:+--players-file "$PLAYERS_FILE"} --out "$OUT/epoch-$epoch" \
    --secret-out ".secrets/escrow/$NAME-$epoch.json" >/dev/null
  # A live world's salts are its players' privacy: each gets only their own, from the game.
  [ -n "${PLAYERS_FILE:-}" ] && mv "$OUT/epoch-$epoch/players-private-demo.json" ".secrets/escrow/$NAME-$epoch-players.json"
  [ "${3:-}" = broken ] && echo "broken build: $core" > "$OUT/epoch-$epoch/BROKEN"
  input=$(mktemp)
  ./target/release/encore make-input --commitment "$OUT/epoch-$epoch/commitment.json" --package-b64 "$OUT/epoch-$epoch/package.b64" \
    --seed "$(python3 -I -c 'import secrets;print(secrets.token_hex(32))')" > "$input"
  ./target/release/encore preflight --input "$input" --secret ".secrets/escrow/$NAME-$epoch.json" > "$OUT/epoch-$epoch/preflight.json"
  rm -f "$input"
  pass=$(python3 -I -c "import json;print(json.load(open('$OUT/epoch-$epoch/preflight.json'))['pass'])")
  echo "preflight (the pinned verifier, run locally): pass=$pass"
  [ "$pass" = True ] || [ "${3:-}" = broken ] || { echo "not committing a build that fails the verifier" >&2; exit 1; }
  args=$(python3 -I -c "
import json
c=json.load(open('$OUT/epoch-$epoch/commitment.json'))
d={k:c[k] for k in ('game','epoch','ckd_pk','app_id','pkg_sha256','root','core_sha256','players')}
d['sealed_u']=c['sealed_key']['u']; d['sealed_v']=c['sealed_key']['v']
print(json.dumps({'commitment':d}))")
  scripts/near/call.sh "$pub" "$ESCROW" commit "$args" "0 NEAR" "50.0 Tgas" | record "05-commit-$epoch"
  "$0" package "$epoch"
  ;;
package)
  epoch=${2:?epoch}
  dir=$(mktemp -d)
  ./target/release/encore fastfs-payloads --file "$OUT/epoch-$epoch/package.sealed" --out-dir "$dir" \
    --ext sealed --mime application/octet-stream > /dev/null
  # FastFS indexes the call's arguments; the call itself is meant to fail (1 gas), and costs almost nothing.
  { "$NEAR" contract call-function as-transaction "$ESCROW" __fastdata_fastfs base64-args "$(base64 < "$dir/payload-0.bin" | tr -d '\n')" \
    prepaid-gas '0.000000000001 Tgas' attached-deposit '0 NEAR' sign-as "$pub" network-config testnet \
    sign-with-legacy-keychain send 2>&1 || true; } | record "05-package-$epoch"
  rm -rf "$dir"
  url="https://test.fastfs.io/$pub/$ESCROW/$(shasum -a 256 "$OUT/epoch-$epoch/package.sealed" | cut -c1-64).sealed"
  echo "$url" > "$OUT/epoch-$epoch/package-url.txt"
  echo "package: $url"
  ;;
secret)
  epoch=${2:?epoch}; profile="$PROFILE-$epoch"
  body=$(python3 -I -c "import json;print(json.dumps({'accessor':{'type':'WasmHash','hash':'$VERIFIER_HASH'},'owner':'$pub','profile':'$profile','secrets_json':'{}'}))")
  curl -sf -m 60 -X POST "$API/secrets/pubkey" -H 'Content-Type: application/json' -d "$body" > "$OUT/06-pubkey-$epoch.json"
  pubkey=$(python3 -I -c "import json;print(json.load(open('$OUT/06-pubkey-$epoch.json'))['pubkey'])")
  ct=$(./target/release/encore outlayer-secret --pubkey "$pubkey" --secret ".secrets/escrow/$NAME-$epoch.json")
  access=$(python3 -I -c "import json;print(json.dumps({'Logic':{'operator':'And','conditions':[{'WasmHash':{'hash':'$VERIFIER_HASH'}},{'Predecessor':{'condition':{'Whitelist':{'accounts':['$ESCROW']}}}}]}}))")
  store=$(python3 -I -c "import json,sys;print(json.dumps({'accessor':{'WasmHash':{'hash':'$VERIFIER_HASH'}},'profile':'$profile','encrypted_secrets_base64':sys.argv[1],'access':json.loads(sys.argv[2]),'vault_id':None}))" "$ct" "$access")
  est=$(scripts/near/view.sh outlayer.testnet estimate_storage_cost "$(python3 -I -c "import json,sys;d=json.loads(sys.argv[1]);d['owner']='$pub';print(json.dumps(d))" "$store")" | tr -d '"')
  dep=$(python3 -I -c "print(f'{($est * 1.2) / 1e24:.6f} NEAR')")
  scripts/near/call.sh "$pub" outlayer.testnet store_secrets "$store" "$dep" "100.0 Tgas" | record "06-secret-$epoch"
  ;;
verify)
  epoch=${2:?epoch}
  scripts/near/call.sh "$stranger" "$ESCROW" verify "$(pkg_args "$epoch")" \
    "$(deposit_near $(( $(wc -c < "$OUT/epoch-$epoch/package.b64") * 2 + 4096 )))" "300.0 Tgas" | record "07-verify-$epoch-$(date +%s)"
  "$0" status
  ;;
prove)
  id=${2:?OutLayer request id}
  curl -sf -m 60 "$API/attestations/by-request/$id" > "$OUT/attestation-$id.json"
  scripts/near/view.sh "$REGISTRY" get_approved_measurements > "$OUT/approved-measurements.json"
  ENCORE_VERIFY_QUOTE_ARGS="$OUT/verify-quote-$id.b64" ./target/release/encore-attest "$OUT/attestation-$id.json" "$OUT/approved-measurements.json" \
    > "$OUT/attestation-$id-check.json"
  index=${3:-$(scripts/near/view.sh "$ESCROW" get_runs | python3 -I -c 'import json,sys;r=json.load(sys.stdin);print(max(i for i,x in enumerate(r) if x["kind"]=="verify"))')}
  python3 -I -c "
import json
a=json.load(open('$OUT/attestation-$id.json'))
print(json.dumps({'index':$index,'attestation':a,'quote':a['tdx_quote'],'collateral':open('$OUT/verify-quote-$id.b64.collateral').read().strip()}))" > "$OUT/prove-args-$id-$index.json"
  scripts/near/call.sh "$stranger" "$ESCROW" prove_run "$(cat "$OUT/prove-args-$id-$index.json")" "0 NEAR" "300.0 Tgas" | record "08-prove-$id-run$index"
  "$0" status
  ;;
heartbeat)
  scripts/near/call.sh "$pub" "$ESCROW" heartbeat '{}' "0 NEAR" "30.0 Tgas" | record "09-heartbeat-$(date +%s)"
  ;;
release)
  scripts/near/call.sh "$stranger" "$ESCROW" release '{}' "0 NEAR" "100.0 Tgas" | record "10-release-$(date +%s)"
  "$0" status
  ;;
open)
  epoch=${2:?epoch}
  scripts/near/view.sh "$ESCROW" get_state > "$OUT/11-state-released.json"
  read -r by bc < <(python3 -I -c "import json;r=json.load(open('$OUT/11-state-released.json'))['released'];print(r['big_y'], r['big_c'])")
  ./target/release/encore verify-release --commitment "$OUT/epoch-$epoch/commitment.json" --big-y "$by" --big-c "$bc" \
    --key-mode pv_identity | tee "$OUT/11-release-check.json"
  sig=$(python3 -I -c "import json;print(json.load(open('$OUT/11-release-check.json'))['sig_hex'])")
  ./target/release/encore open --commitment "$OUT/epoch-$epoch/commitment.json" --package "$OUT/epoch-$epoch/package.sealed" --sig "$sig" \
    | tee "$OUT/12-open.json"
  ;;
watch)
  field() { scripts/near/view.sh "$ESCROW" status | python3 -I -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
  until [ "$(field release_condition_met)" = True ]; do sleep 60; done
  echo "silent at $(date -u +%FT%TZ)"
  [ "$(field phase)" = released ] || "$0" release || true
  until [ "$(field phase)" = released ]; do sleep 10; done
  "$0" open "$(field epoch)"
  ;;
status)
  scripts/near/view.sh "$ESCROW" status | tee "$OUT/status.json" | python3 -I -c '
import json,sys
s=json.load(sys.stdin)
print("phase", s["phase"], "| badge", s["badge"], "| epoch", s["epoch"], "| proven run", s["proven_run"], "| release condition met", s["release_condition_met"])'
  scripts/near/view.sh "$ESCROW" get_runs | python3 -I -c '
import json,sys
for i,r in enumerate(json.load(sys.stdin)):
    print("  run", i, "epoch", r["epoch"], "| output_ok", r["output_ok"], "| t1", r["t1"], "| accepted", r["accepted"])'
  ;;
*) sed -n '2,20p' "$0"; exit 2 ;;
esac
