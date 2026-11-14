#!/usr/bin/env bash
# usage: view.sh <contract> <method> [json-args]
set -u
ARGS=${3:-'{}'}
# GNU base64 wraps at 76 columns (macOS does not): strip newlines so long args stay one JSON string.
curl -s --retry 3 --retry-all-errors --max-time 25 https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$ARGS" | base64 | tr -d '\n')\"}}" | python3 -I -c "import json,sys;d=json.load(sys.stdin);r=d.get('result',{});print(bytes(r['result']).decode() if 'result' in r else json.dumps(d))"
