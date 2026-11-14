# Properties

What Encroe guarantees, each with the test that holds it and, where there is one, the live run that shows it.

| # | Property | Test | Live |
|---|---|---|---|
| 1 | **Keyless.** An escrow has no access keys before anything is sealed; a factory escrow never had one | (on chain) | every escrow page; `/break` attack 07 |
| 2 | **Only the studio seals and beats.** `commit` and `heartbeat` are the owner's alone | (contract `assert_owner`) | `/break` attacks 02, 03 |
| 3 | **Forward only.** An epoch number never goes back | `an_epoch_cannot_be_rolled_back` | |
| 4 | **No early release.** `release` is refused while the heartbeat holds and no end of life is due | `nobody_releases_while_the_studio_is_alive` | kill-827e step 8; `/break` 01 |
| 5 | **Final.** A released escrow cannot be re-sealed or released again | `a_silent_studio_is_released_by_anyone_and_cannot_reseal` | life-52e4 step 13; `/break` 06 |
| 6 | **A run speaks for its epoch.** A new epoch starts unverified; a broken build is red | `badge_follows_the_current_epoch` | life-52e4 steps 3–5 |
| 7 | **Hardware, not an operator.** A run turns green only once NEAR's DCAP verifier accepts its quote, bound to that run | `only_a_quote_nears_verifier_accepted_turns_it_green` | life-52e4 steps 7–8; `/break` 05 |
| 8 | **Only the committed package is verified.** Its hash is checked before the enclave is called | (contract `request_run`) | `/break` 04 |
| 9 | **The key is this escrow's.** The release is the MPC network's signature for this contract's identity, and nobody else's | `release.test.ts` | every revive, check 2–3 |
| 10 | **What comes back is what was sealed.** Package hash, core hash and players' root, before anything runs | `revive.test.ts` | every revive, checks 4–7 |
| 11 | **Private until released.** Salted leaves; a player's proof only for their own key | `proof.test.ts`, `/api/proof` | `/play` vault check |
| 12 | **The core decides.** Moves are signed; the host only checks who and when; replays are refused | `world.test.ts` | `/play` |
| 13 | **Conservation.** Trades create and destroy nothing, in every sealed core, in any language | `cores.test.ts`, `check.test.ts` | the enclave's verdict on every run |
| 14 | **No surprises in a core.** A sealed core imports nothing | `cores.test.ts`, `scripts/build/cores.sh` | every revive, check 8 |
| 15 | **One escrow build.** Every factory escrow runs the escrow wasm compiled into the factory | `the_escrow_code_is_the_one_compiled_in` | `escrow_code_sha256()` |
| 16 | **A browser seals what the Rust sealer seals.** A package sealed in the browser opens with the CLI, and its key rows open as OutLayer's keystore opens them | `seal.test.ts`, `fastfs.test.ts` | [browser-seal](results/escrow/browser-seal/README.md): epoch 2 green |
| 17 | **Only committed packages go on NEAR through the site.** The relayer puts a package on FastFS only once its hash is the escrow's commitment | `/api/seal/fastfs` | browser-seal step 4 |
| 18 | **Items leave only from a released world, only the player's own, only once.** `encroe-items` signs a claim only for a factory escrow that is released, a leaf under its root, a signature by the player's key, and a player not yet claimed; `EncroeItems` mints only what that MPC key signed, once | `encroe-items` tests (the site's leaf and root), `EncroeItems.t.sol` (other signer, changed claim, second claim) | [items](results/items/README.md): forged, inflated, live-escrow and repeated claims refused |
| 19 | **NEAR and the EVM agree on the claim.** Both contracts compute the same EIP-712 digest for the same claim | `claim_digest_is_eip712`, `test_digest_is_the_one_NEAR_signs` | the relayed mint on Base Sepolia |
| 20 | **Reproducible cores.** Each core rebuilt from source hashes to the `core_sha256` its escrow committed | `scripts/build/cores.sh` | [engines](results/escrow/engines/README.md) |
