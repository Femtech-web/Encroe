#!/usr/bin/env bash
# The studio's bot for a live game: everything a studio does to keep its escrow honest, on a schedule.
#
#   scripts/studio/bot.sh seal          one epoch: export the live world from the game, seal it with the game's
#                                       core, preflight it with the pinned verifier, commit it, store its secret
#                                       row, have a stranger ask the enclave to verify it, relay NEAR's quote
#                                       check, and hand every player their own inclusion proof
#   scripts/studio/bot.sh heartbeat     the studio's sign of life
#   scripts/studio/bot.sh run <hours>   heartbeat every hour; seal a new epoch every <hours>
#   scripts/studio/bot.sh pool <n>      n "kill the studio" escrows: each locked, sealed from the live world, verified
#                                       green, then never heartbeated, so after GRACE_S (default 120) seconds anyone
#                                       may release it; listed in docs/results/escrow/pool.txt and offered on the
#                                       site's revive page (web/lib/encroe/pool.json)
#
# The escrow is ESCROW_NAME (or docs/results/escrow/current). The game is ENCROE_GAME_URL (default
# http://localhost:3000), reached with ENCROE_STUDIO_TOKEN from .env; both stay out of the log.
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
GAME=${ENCROE_GAME_URL:-http://localhost:3000}
: "${ENCROE_STUDIO_TOKEN:?set ENCROE_STUDIO_TOKEN in .env (the same value the game has)}"
export ENCROE_CORE=web/public/core/embergate.wasm
ESC=scripts/testnet/escrow.sh
NAME=${ESCROW_NAME:-$(cat docs/results/escrow/current)}
export ESCROW_NAME=$NAME
OUT=docs/results/escrow/$NAME

status() { scripts/near/view.sh "encroe-$NAME.testnet" status; }
field() { python3 -I -c "import json,sys;v=json.load(sys.stdin).get('$1');print('' if v is None else v)"; }

seal() {
  local epoch world request badge
  epoch=$(( $(status | field epoch | sed 's/^$/0/') + 1 ))
  world=".secrets/escrow/$NAME-$epoch-world.json"
  curl -sf -m 30 -H "authorization: Bearer $ENCROE_STUDIO_TOKEN" "$GAME/api/studio/world" > "$world"
  echo "epoch $epoch: $(python3 -I -c "import json;print(len(json.load(open('$world'))))" ) players from $GAME"

  PLAYERS_FILE=$world "$ESC" seal "$epoch"
  "$ESC" secret "$epoch"
  "$ESC" verify "$epoch"
  request=$(python3 -I -c "
import json
rows=[json.loads(l) for l in open('$OUT/log.jsonl')]
print([r for r in rows if r['step'].startswith('07-verify-$epoch-')][-1]['request_id'])")
  echo "OutLayer request $request; waiting for the enclave"
  for _ in $(seq 60); do
    badge=$(status | field badge)
    [ "$badge" = pending ] || break
    sleep 10
  done
  echo "badge after the run: $badge"
  # The attestation is published shortly after the run; NEAR's DCAP verifier then decides.
  for _ in $(seq 12); do "$ESC" prove "$request" && break; sleep 15; done
  [ "${PUBLISH:-1}" = 1 ] && publish "$epoch"
  return 0
}

# Each player's line (salt, leaf, path) goes back to the game, which serves it only to the key's holder.
publish() {
  python3 -I - "$1" "$NAME" "$OUT" > "$OUT/epoch-$1/published.json" <<'PY'
import json, sys, time
epoch, name, out = sys.argv[1:]
c = json.load(open(f"{out}/epoch-{epoch}/commitment.json"))
players = json.load(open(f".secrets/escrow/{name}-{epoch}-players.json"))
json.dump({"escrow": f"encroe-{name}.testnet", "epoch": int(epoch), "root": c["root"],
           "sealed_at": int(time.time() * 1000), "players": players}, open(f".secrets/escrow/{name}-{epoch}-sealed.json", "w"))
print(json.dumps({"escrow": f"encroe-{name}.testnet", "epoch": int(epoch), "root": c["root"], "players": len(players)}))
PY
  curl -sf -m 30 -X POST -H "authorization: Bearer $ENCROE_STUDIO_TOKEN" -H 'content-type: application/json' \
    --data-binary "@.secrets/escrow/$NAME-$1-sealed.json" "$GAME/api/studio/sealed"
  echo
}

case "${1:-}" in
seal) seal ;;
heartbeat) "$ESC" heartbeat ;;
publish) publish "${2:?epoch}" ;;
run)
  hours=${2:?hours between seals}
  last=0
  while true; do
    "$ESC" heartbeat || true
    if (( $(date +%s) - last >= hours * 3600 )); then seal || echo "seal failed; next try in an hour" >&2; last=$(date +%s); fi
    sleep 3600
  done
  ;;
pool)
  keep=$NAME
  for _ in $(seq "${2:?how many}"); do
    NAME="kill-$(python3 -I -c 'import secrets;print(secrets.token_hex(2))')"
    ESCROW_NAME=$NAME "$ESC" deploy "$NAME" "${GRACE_S:-120}"
    export ESCROW_NAME=$NAME
    OUT=docs/results/escrow/$NAME
    "$ESC" refresh
    PUBLISH=0 seal
    echo "encroe-$NAME.testnet" >> docs/results/escrow/pool.txt
    python3 -I -c "import json,sys;p='web/lib/encroe/pool.json';l=json.load(open(p));l.append(sys.argv[1]);json.dump(l,open(p,'w'))" "encroe-$NAME.testnet"
  done
  echo "$keep" > docs/results/escrow/current
  ;;
*) sed -n '2,16p' "$0"; exit 2 ;;
esac
