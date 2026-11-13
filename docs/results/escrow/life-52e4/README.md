# One game's escrow, its whole life, on one locked contract (2026-11-13)

The claim: a studio can put its game's server in escrow so that **while it lives, anyone can check the sealed build
is real**, and **when it goes silent, the game goes to its players**, with no one's permission and no key anyone
holds. The contract: [`contracts/encroe-escrow`](../../../../contracts/encroe-escrow) at
`encroe-life-52e4.testnet`, **locked before anything was sealed** (0 access keys; wasm sha256 `08d9174f…`, equal to
the local build). Runbook: [`scripts/testnet/escrow.sh`](../../../../scripts/testnet/escrow.sh); every step's output is
in this folder and one line per step in [log.jsonl](log.jsonl). The studio's silence was simulated by us, and is
disclosed: we stopped sending heartbeats.

| # | Step | By | Transaction | Result |
|---|---|---|---|---|
| 1 | Create, deploy, lock | | [`3TgQ8qjc…`](https://testnet.nearblocks.io/txns/3TgQ8qjcfWudLHaoeLw8JA1gb7nx5hpsKVFFqKRSCesX), [`BxD8ZomQ…`](https://testnet.nearblocks.io/txns/BxD8ZomQH8ufTP8M43GBTcPKXvQG3o3bqMGpGXkovuER) | **0 access keys**: nobody, including us, can change its code |
| 2 | Copy OutLayer's approved enclave images | a stranger | [`E4XEoB5z…`](https://testnet.nearblocks.io/txns/E4XEoB5z6nJtmaKHnsTfqs3UkmVK849EA5yv6QMAits3) | 129 images |
| 3 | The studio seals epoch 1: a **broken** build | the studio | [`GK7LvR1r…`](https://testnet.nearblocks.io/txns/GK7LvR1rjML7k2JpXikvfe59YUhKkUV5D35XBsHK8Vzc) | committed: package, core and player-root hashes, the key sealed to NEAR's MPC network |
| 4 | The enclave verifies it, without anyone opening it | a stranger | [`EBT3yeEe…`](https://testnet.nearblocks.io/txns/EBT3yeEemVeurrvCuVkhKzYfas8uCTqTAdxnphL5HmYE) | **red**: the key and every hash checked out, but the server misreported players' items (`states_served: false`) and broke item conservation |
| 5 | The studio seals epoch 2: the real build | the studio | [`HCnZf9dy…`](https://testnet.nearblocks.io/txns/HCnZf9dybxN78d7hokPdawEuYsqXThTNajxhDn8nptZf) | the badge starts over: a run speaks only for the epoch it verified |
| 6 | The enclave verifies it (OutLayer request 40727) | a stranger | [`EiikfzPt…`](https://testnet.nearblocks.io/txns/EiikfzPtsm7hGEKpUkhnAG6orsDZYGYAUuZy7bZkncQS) | passed: all 16 sampled players served exactly, items conserved across 17 trades; badge `awaiting-proof` |
| 7 | **NEAR verifies the enclave**: its Intel TDX quote goes to NEAR's DCAP verifier | a stranger | [`97uUG9v9…`](https://testnet.nearblocks.io/txns/97uUG9v9stDYpz5o9j8LdVDCzb36idnvopwdEdSQFahQ) | **green**: `UpToDate`, bound to this exact run's input, output, build and secret |
| 8 | Attack: the same quote, for another run | a stranger | [`8dX9evB9…`](https://testnet.nearblocks.io/txns/8dX9evB9Rx1uEnazShjE18RAW1yfm8QqyKDNdfzBWf9h) | **refused**: `attestation: input differs from what this contract sent` |
| 9 | Attack: release while the studio is alive | a stranger | [`44Jvj33H…`](https://testnet.nearblocks.io/txns/44Jvj33HAfmarEmUyTJx5vfns75Rv9e9FroEWMXFYXfv) | **refused**: `release condition not met: publisher heartbeat is live` |
| 10 | The studio goes silent (simulated): no heartbeat after 20:55:14 UTC; grace 10 minutes | | | the release condition holds from 21:05:21 |
| 11 | **Release**: anyone may ask; NEAR's MPC network publishes the key | a stranger | [`4qATdQ1D…`](https://testnet.nearblocks.io/txns/4qATdQ1DkYgUVWKnmxELMu4b6xCmB2wDYTQPXyL2U8AB) | phase `released` |
| 12 | **Anyone opens the game** with the published key | anyone, off chain | [12-open.json](12-open.json) | the key passes the pairing check for this contract's identity; the decrypted package, core and player root **match exactly what the enclave verified** |
| 13 | The studio tries to heartbeat, then to re-seal, after release | the studio | [`3KhBvrir…`](https://testnet.nearblocks.io/txns/3KhBvrirqrAKEhQuot6hVCEsbkr5nVqU4DDrL2Gduz74), [`3gZ7ZBhz…`](https://testnet.nearblocks.io/txns/3gZ7ZBhzr19Fn4P5yxZdM23ax2hJQhvypzmCu1FAN2b9) | **refused**: `already released` |

## Check it yourself

```bash
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"encroe-life-52e4.testnet","method_name":"status","args_base64":"e30="}}' \
  | python3 -c 'import json,sys;s=json.loads(bytes(json.load(sys.stdin)["result"]["result"]));print(s["phase"], s["badge"], "epoch", s["epoch"], "released by", s["released_by"])'
```

You should see `released green epoch 2 released by encore-stranger-6b4dad.testnet`. Then rebuild and repeat the open:
`make test`, and `scripts/testnet/escrow.sh open 2` with `ESCROW_NAME=life-52e4`.

## What it does not show yet

- A game players play. The sealed core here is the go/no-go game's inventory-and-trade core with 24 generated
  players; the next step is a real game whose server is this kind of core.
- Hosting after release, paid on proof, and in-game items handed over on other chains: not built.
- The enclave is OutLayer's (Intel TDX); its worker operator keys are not trusted, because acceptance waits for NEAR's
  own DCAP verifier.
