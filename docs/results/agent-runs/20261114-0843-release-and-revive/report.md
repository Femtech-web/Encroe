I released and revived **Embergate** (Rust) from `encroe-kill-5609.testnet`, and all 8 revival checks passed.

## Choosing the game
Out of 15 escrows, two were silent: `encroe-kill-5609` and `encroe-kill-19d2`. Both are Embergate, from the same studio, `encore-pub-6b4dad.testnet`. Both passed inspection, and I picked `5609`. I didn't touch `19d2`; it's still silent and anyone can release it.

## Checks before releasing
| Check | Result |
|---|---|
| Access keys | **0**, locked. No one, including the studio, can sign for the contract. |
| Code | Runs the published escrow code, sha256 `08d9174f…b3901fbf` (the same as `19d2`). |
| Enclave verification | Epoch 1 run: `accepted`, output OK, TCB `UpToDate`. Badge green. |
| Release condition | Met. The studio has been silent 10 hours, past its grace period, and no one had released it. |
| Sealed contents | Epoch 1, 5 players, root `5d48aa80…`, core `49ff0c57…`, package `8b48f2dd…` |

## Steps
1. **Release:** transaction `zCcjj8SVEB7r43tPGxVdXJHeAbyvsFyz693FQ4RGhN4` was sent. The site's relay `encroe-relay-3778.testnet` paid the gas.
2. **Wait:** I checked three times. The phase went from `silent` to `releasing` (twice) to **`released`**. The sealed contents didn't change during the release.
3. **Bring back:** this used only public data. All 8 checks passed:

| # | Check | Detail |
|---|---|---|
| 1 | Read the escrow from NEAR | epoch 1, released by the relay |
| 2 | The key belongs to this contract | app id `d8b65efe4513cfaf…` |
| 3 | NEAR's MPC network signed the release | pairing check `e(sig, g2) = e(H(pk‖app id), pk)` passed |
| 4 | The package is the committed one | 11,221 bytes from FastFS, sha256 `8b48f2dd…` (matches the sealed hash) |
| 5 | It decrypts with the released key | AES-256-GCM, 5 players inside |
| 6 | The server core is the verified build | sha256 `49ff0c57…` (matches the enclave-verified core) |
| 7 | Players' items match NEAR's root | 5 leaves give `5d48aa80…` (matches the on-chain root) |
| 8 | The server boots | 14 exports, 0 imports |

## What the revived world holds
Embergate, epoch 1: **5 players and 35 items**, with every item matching the root committed on NEAR. The server core boots with 0 imports, so it needs nothing from outside to run. That's the same as earlier revivals of other Embergate escrows from this studio (`ember-3924`, `kill-beaa` and `kill-827e`, each 5 players and 35 items).

I can't list item names per player: the lookup needs a player's public key, and I don't have one. If you give me one, I can list that player's items.
