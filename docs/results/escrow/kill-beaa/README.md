# Kill the studio, from the site: a judge releases a silent escrow and the game comes back (2026-11-14)

The same run as [kill-827e](../kill-827e/README.md), driven from the site the way a judge would use it, with no NEAR
wallet: `/revive?escrow=encroe-kill-beaa.testnet` finds the studio silent, **Release it** sends the escrow's
permissionless `release` from a throwaway testnet account that only pays the gas (`encroe-relay-3778.testnet`,
[`web/app/api/release`](../../../../web/app/api/release/route.ts)), and the page brings the game back as soon as
NEAR shows the key published.

| # | Step | By | Transaction | Result |
|---|---|---|---|---|
| 1 | Create, deploy, lock (grace 2 minutes; the studio never heartbeats, a disclosed simulation) | | [`log.jsonl`](log.jsonl) | **0 access keys** |
| 2 | Seal the live world (5 players), preflight, commit, put the package on FastFS | the studio | [`6TsMyV9w…`](https://testnet.nearblocks.io/txns/6TsMyV9wdHHyYgjfshfsVQemfh5aSNA2d75m3bg8Kyf4), [`BNhHcRYg…`](https://testnet.nearblocks.io/txns/BNhHcRYgbYUAYqa5wMqQmmiqc4rdUzeiN3313sXNDg9f) | [preflight](epoch-1/preflight.json) `pass: true` |
| 3 | The enclave verifies it; NEAR's DCAP verifier checks the quote | a stranger | [`HQM3Lavv…`](https://testnet.nearblocks.io/txns/HQM3Lavvfw65M8zPMbicUCJN2g8GdtnNtbaLYfn5VuZs), [`EA4EzV8s…`](https://testnet.nearblocks.io/txns/EA4EzV8s9EwF5tpmH1ohzMGd8tNqa3jBYNvk1VY3mp5k) | **green** (OutLayer request 41250, `UpToDate`) |
| 4 | **Release it**, pressed on the site | the site's relayer | [`2tFkQx2V…`](https://testnet.nearblocks.io/txns/2tFkQx2V8p3JR5PmWQBCCbupQsDcCLdA85ASiXqu4YbJ) | phase `released`, `released_by: encroe-relay-3778.testnet` |
| 5 | The page brings the game back on its own | the judge's browser | | [screenshot](site-release-revive.png): all eight checks pass, 5 players, Play on |
