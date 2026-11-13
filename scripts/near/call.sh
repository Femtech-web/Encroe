#!/usr/bin/env bash
# usage: call.sh <signer> <contract> <method> <json-args> [deposit, default "0 NEAR"] [gas, default "300.0 Tgas"]
set -u
NEAR="$(dirname "$0")/../../node_modules/.bin/near"
"$NEAR" contract call-function as-transaction "$2" "$3" json-args "$4" prepaid-gas "${6:-300.0 Tgas}" attached-deposit "${5:-0 NEAR}" sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1
