# The public world's escrow: encroe-embergate.testnet

The escrow behind [encroe.vercel.app](https://encroe.vercel.app). Whoever plays Embergate on the site has their
items sealed into it at each epoch, verified by the enclave, and can check from their own browser that they are
inside. Its grace is **14 days**: if the studio stops sending heartbeats for that long, anyone may release it, and
the world goes to its players.

- **The contract**: [`contracts/encroe-escrow`](../../../../contracts/encroe-escrow), wasm sha256 `08d9174f…`, the
  same build as every other run.
- **Funded** by our stranger account (5 NEAR for storage), because the testnet faucet was rate-limiting.
- **Locked before anything was sealed.** The first lock transaction tried to delete a stale key (a failed faucet
  attempt had left a key file under the same name), so it failed and the account kept its one real key. The retry
  deleted that key before the first commit. The runbook now deletes the keys NEAR reports for the account.
- **The studio's bot** seals the live world: by hand with `ESCROW_NAME=embergate
  ENCROE_GAME_URL=https://encroe.vercel.app scripts/studio/bot.sh seal`, or every six hours by
  [`.github/workflows/studio.yml`](../../../../.github/workflows/studio.yml) once its secret is set.

| # | Step | By | Transaction | Result |
|---|---|---|---|---|
| 1 | Create, deploy | | [`4aZE5PxH…`](https://testnet.nearblocks.io/txns/4aZE5PxHtuNMYWfGpNgADAvUQZBZazLauANSWqna8w8W), [`GXM62Tve…`](https://testnet.nearblocks.io/txns/GXM62TveACH2RMwks9uWF7GJiyaWd9uuLhmGSkH9tMin) | |
| 2 | Copy OutLayer's approved enclave images | a stranger | [`teN5i32P…`](https://testnet.nearblocks.io/txns/teN5i32PWSP3WyKwGvR9NVqfXJYsqzLnMwjcvroUZ5u) | 129 images |
| 3 | Lock (after a failed first try, [`HnjhDvLV…`](https://testnet.nearblocks.io/txns/HnjhDvLVZxeTJHzV8K7GstxpBH5Kom9vACfnUDXU2tQM)) | | [`AdPiGscu…`](https://testnet.nearblocks.io/txns/AdPiGscu6vPxbnwGVEBj1wJAkUQ23n5ugwcurZ5je75q) | **0 access keys** |
| 4 | Epoch 1: the site's world (1 player: `DeployCheck`, the deployment's smoke test), sealed, preflighted, committed | the studio | [`Cj9hSUwo…`](https://testnet.nearblocks.io/txns/Cj9hSUwogFuuNUjZwyZkixFA3ZGo4z2uKepaAY7QZX3m) | [preflight](epoch-1/preflight.json) `pass: true` |
| 5 | The package on FastFS | the studio | [`hKukEX5L…`](https://testnet.nearblocks.io/txns/hKukEX5LUrCXJiJL9nw5eFxxfkyMFVfKug2At64zkfz) | |
| 6 | The enclave verifies it (OutLayer request 41519); NEAR's DCAP verifier checks the quote | a stranger | [`EDXiXaSJ…`](https://testnet.nearblocks.io/txns/EDXiXaSJHZnKmtjVM3oA1LSVQiCgzgpgq7WKNrZb9znj), [`2cpRMhNY…`](https://testnet.nearblocks.io/txns/2cpRMhNYGEScq5yEo5STPaKtsYXFY55tHDbLYRgUvcqr) | **green** |
| 7 | Every player's proof handed to the site | the studio | | [published](epoch-1/published.json): 1 |
| 8 | The first scheduled run (GitHub Actions): a heartbeat, then epoch 2 committed and its package put on FastFS | the studio's workflow | [`E1tmPT1z…`](https://testnet.nearblocks.io/txns/E1tmPT1zerXgvrtTzPDYJMWVekWEgUFRABw2GCY1XtHW), [`3B8qHgCz…`](https://testnet.nearblocks.io/txns/3B8qHgCzf6YPKQg5XL6rtkkcMrbxQWEDVJrR87ZAY922) | **stranded**: storing the epoch's key row then failed on the runner (Linux `base64` wraps long lines; macOS does not), and the key row lived only on that runner, so epoch 2 can never be verified. Fixed twice: the arguments are unwrapped, and the bot now stores the key row *before* it commits |
| 9 | Epoch 3, in the new order: key row, commit, package, players' proofs, then the enclave | the studio | [`CbU8mDYS…`](https://testnet.nearblocks.io/txns/CbU8mDYSxZr4FekgSQUoddBHbg5EXThx5dkQCPMAmWsQ), [`9gVa9vRS…`](https://testnet.nearblocks.io/txns/9gVa9vRSGJQmkZ5hRJr4gC1bW1aCW8i7jreJ3A9hVpJ9), [`JDc5mJ9o…`](https://testnet.nearblocks.io/txns/JDc5mJ9ou2hcMvtDBZtEzr1fVY41smv3kC7tqjuHhjAC), [`31caeEHJ…`](https://testnet.nearblocks.io/txns/31caeEHJou78gmuYALTRT9EAx4mB2KQitW93JdeuJrha) | **green** (OutLayer request 41740) |

Later epochs are appended to [log.jsonl](log.jsonl) as the bot seals them.
