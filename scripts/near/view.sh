#!/usr/bin/env bash
# usage: view.sh <contract> <method> [json-args]
set -u
ARGS=${3:-'{}'}
curl -s --max-time 25 https://rpc.testnet.fastnear.com -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$ARGS" | base64)\"}}" | python3 -I -c "import json,sys;d=json.load(sys.stdin);r=d.get('result',{});print(bytes(r['result']).decode() if 'result' in r else json.dumps(d))"
