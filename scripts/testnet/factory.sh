#!/usr/bin/env bash
# Encroe's factory and directory on testnet (contracts/encroe-factory). Every step's output is kept in
# docs/results/factory/, one line per step in its log.jsonl.
#
#   scripts/testnet/factory.sh deploy                       create encroe.testnet (faucet, or FUND_FROM=<account>),
#                                                           deploy and init the factory, then delete its keys
#   scripts/testnet/factory.sh create <name> <grace_s> <game> [owner]
#                                                           a studio's escrow, <name>.encroe.testnet, keyless from
#                                                           birth; the studio (default: ours) pays 5 NEAR storage
#   scripts/testnet/factory.sh list
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
NEAR=./node_modules/.bin/near
FACTORY=${FACTORY:-encroe.testnet}
WASM=contracts/encroe-factory/target/near/encroe_factory.wasm
VERIFIER_HASH=9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad
OUT=docs/results/factory
mkdir -p "$OUT"

plain() { sed 's/\x1b\[[0-9;]*m//g'; }
record() {
  local step=$1
  plain > "$OUT/$step.txt"
  python3 -I - "$step" "$OUT/$step.txt" "$OUT/log.jsonl" <<'PY'
import json, re, sys, time
step, path, log = sys.argv[1:]
text = open(path).read()
tx = re.findall(r"Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})", text)
err = re.search(r"Smart contract panicked: ([^\n\"]+)", text)
entry = {"at": int(time.time()), "step": step, "tx": tx[-1] if tx else None, "refused": err.group(1).strip() if err else None}
open(log, "a").write(json.dumps(entry) + "\n")
print(json.dumps(entry))
PY
}
keys() {
  curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | python3 -I -c 'import json,sys;print(",".join(k["public_key"] for k in json.load(sys.stdin)["result"]["keys"]))'
}

case "${1:-}" in
deploy)
  (cd contracts/encroe-escrow && ../../node_modules/.bin/cargo-near near build non-reproducible-wasm >/dev/null)
  (cd contracts/encroe-factory && ../../node_modules/.bin/cargo-near near build non-reproducible-wasm >/dev/null)
  shasum -a 256 "$WASM" contracts/encroe-escrow/target/near/encroe_escrow.wasm > "$OUT/code-sha256.txt"
  if [ -n "${FUND_FROM:-}" ]; then
    { "$NEAR" account create-account fund-myself "$FACTORY" '5 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
      sign-as "$FUND_FROM" network-config testnet sign-with-legacy-keychain send 2>&1 || true; } | record 01-create
  else
    { "$NEAR" account create-account sponsor-by-faucet-service "$FACTORY" autogenerate-new-keypair save-to-legacy-keychain \
      network-config testnet create 2>&1 || true; } | record 01-create
  fi
  sleep 5
  args=$(python3 -I -c "import json;print(json.dumps({'mpc':'v1.signer-prod.testnet','outlayer':'outlayer.testnet','verifier_url':'https://test.fastfs.io/$pub/outlayer.testnet/$VERIFIER_HASH.wasm','verifier_hash':'$VERIFIER_HASH','dcap_verifier':'tee-verifier-2026-07-22.testnet','registry':'worker.outlayer.testnet'}))")
  "$NEAR" contract deploy "$FACTORY" use-file "$WASM" with-init-call new json-args "$args" prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | record 02-deploy
  "$NEAR" account delete-keys "$FACTORY" public-keys "$(keys "$FACTORY")" network-config testnet sign-with-legacy-keychain \
    send 2>&1 | record 03-lock
  echo "$FACTORY access keys: $(keys "$FACTORY" | tr ',' '\n' | grep -c . || true)"
  ;;
create)
  name=${2:?name}; grace=${3:?grace seconds}; game=${4:?game}; owner=${5:-$pub}; payer=${PAYER:-$pub}
  args=$(python3 -I -c "import json,sys;print(json.dumps({'name':sys.argv[1],'owner':sys.argv[2],'game':sys.argv[3],'grace_s':int(sys.argv[4])}))" "$name" "$owner" "$game" "$grace")
  scripts/near/call.sh "$payer" "$FACTORY" create_escrow "$args" "5 NEAR" "300.0 Tgas" | record "create-$name"
  echo "$name.$FACTORY access keys: $(keys "$name.$FACTORY" | tr ',' '\n' | grep -c . || true)"
  ;;
list)
  scripts/near/view.sh "$FACTORY" list '{}'
  ;;
*) sed -n '2,12p' "$0"; exit 2 ;;
esac
