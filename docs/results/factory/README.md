# The factory and directory: encroe.testnet, and the first escrows it made (2026-11-14)

The claim: any studio can create its game's escrow in one call, and the escrow it gets has **never had an access
key**, runs **exactly the published escrow build**, and is **listed** where anyone can find it. Not locked
afterwards: keyless from its first block.

- **The factory**: [`contracts/encroe-factory`](../../../contracts/encroe-factory), wasm sha256 `ba05cf66…`. It
  carries the escrow build (`08d9174f…`) compiled in and deploys exactly that into every escrow it creates.
- **Locked**: the factory itself has 0 access keys, so the build it hands out can never change.
- **Funded** by testnet's faucet (after hours of rate-limiting); the first escrows' 5 NEAR each came from the studio
  account, topped up from our idle experiment accounts (`encore-e1`, `t1.encore-pub`).

| # | Step | Transaction | Result |
|---|---|---|---|
| 1 | Create `encroe.testnet` | [`2k66sq65…`](https://testnet.nearblocks.io/txns/2k66sq6551i71kRD13JnC7G5PAJaamgNpmFLHe2aFwYJ) | |
| 2 | Deploy and initialise the factory (MPC network, OutLayer, pinned verifier, NEAR's DCAP verifier) | [`DvCwrxDk…`](https://testnet.nearblocks.io/txns/DvCwrxDkCjsiDVjE8n9RTjgM62Ad9S5dKYtS7QPYWSnK) | `escrow_code_sha256()` = `08d9174f…` |
| 3 | Lock the factory | [`GoYWfFbG…`](https://testnet.nearblocks.io/txns/GoYWfFbGXNhBHMc5uNFwKytxQSU7evHWaacrtTN1jGEM) | **0 access keys** |
| 4 | A studio creates `matchday.encroe.testnet` (14-day grace) | [`2Fh73w4f…`](https://testnet.nearblocks.io/txns/2Fh73w4fg9dhvpFuBQSLSuqARMyWHLMts8TpWTFXpReH) | **0 access keys, ever**; code `08d9174f…`; listed |
| 5 | A studio creates `neon-city.encroe.testnet` (14-day grace) | [`GWtC4SsZ…`](https://testnet.nearblocks.io/txns/GWtC4SsZQqJA7EyRT4g7Sc8BWc9i7oVeqeX1Pvk1BTd5) | **0 access keys, ever**; code `08d9174f…`; listed |
| 6 | Matchday's world sealed into its factory escrow, verified by the enclave (OutLayer request 41838), NEAR's DCAP verifier accepts | [log](../escrow/matchday/log.jsonl) | **green**: a factory-made escrow works end to end |

Epoch 1 of `matchday.encroe.testnet` is one test club played on our dev server, disclosed; the public Matchday world on
the site is sealed into the same escrow by the studio workflow as players arrive.

## Check it yourself

```bash
scripts/near/view.sh encroe.testnet list            # the directory
scripts/near/view.sh encroe.testnet escrow_code_sha256
```

`view_access_key_list` on `encroe.testnet`, `matchday.encroe.testnet` or `neon-city.encroe.testnet` returns no keys;
`view_code` on either escrow hashes to `08d9174f…`. The site's [/escrows](https://encroe.vercel.app/escrows) lists
them under "Studios' escrows".
