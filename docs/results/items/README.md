# Items handed over on another chain: a released world's items, minted on Base Sepolia through NEAR Chain Signatures (2026-11-14)

The claim: when a studio dies, what its players earned does not have to stay inside the game. Once an escrow is
released, each player can take their items to another chain, signed by a key that **no one holds**. NEAR's MPC network
derives it for one keyless contract and signs only what that contract approves. And the contract approves only a
player's own items, proven against the root the studio committed, claimed by the player's own game key, once.

## The pieces

| | Where | What it does |
|---|---|---|
| [`contracts/encroe-items`](../../../contracts/encroe-items/src/lib.rs) | [`encroe-items-ba9e16.testnet`](https://testnet.nearblocks.io/address/encroe-items-ba9e16.testnet), code `fc69492e…`, **0 access keys** | Reads the escrow's state on NEAR (released? which root?), checks the player's ed25519 signature and Merkle path, then asks NEAR's MPC network to sign an EIP-712 claim |
| The MPC-derived signer | `0x30e6f17b3fBCbD12aF69bBebD2D0c25EfE8AbbCd` | `derived_public_key(path "encroe/items/1", predecessor encroe-items-ba9e16.testnet, domain 0)` on `v1.signer-prod.testnet`; nobody has its private key |
| [`contracts/evm/src/EncroeItems.sol`](../../../contracts/evm/src/EncroeItems.sol) | [`0x94365D73…a2e1`](https://sepolia.basescan.org/address/0x94365D73B3C539680622E681aEAcefeC01c8a2e1) on Base Sepolia | An ERC-1155 that mints only claims that signer signed, once per player per escrow |

The two sides agree byte for byte: the NEAR contract and the Solidity contract compute the same EIP-712 digest for the
same claim (`0x5ef45b10…`, in both test suites), written independently.

## The run

**1. A world that dies.** `handover.encroe.testnet`, made by the factory (0 access keys, ever) with a 5-minute grace:
five scripted Embergate players with real ed25519 game keys (kept in `.secrets/`, disclosed), sealed, verified green
by the enclave, then left silent.

| Step | Transaction | Result |
|---|---|---|
| Created by the factory | [`FcNSZa3w…`](https://testnet.nearblocks.io/txns/FcNSZa3wJgu8VNsKsBPqSS2SBCUcuFoXyoiF4QBj6K9K) | 0 access keys |
| Epoch 1 committed (5 players) | [`Fu7APfSi…`](https://testnet.nearblocks.io/txns/Fu7APfSiHGaA2aUDaSnhAot5ysuJ5hLmYTzYgL6FNy9w) | |
| The enclave verifies it (request 43417), NEAR's DCAP verifier accepts | [`CAmJi1Xg…`](https://testnet.nearblocks.io/txns/CAmJi1XgMnBCGA9Pv7VagJEs9dcdawWrC5rwEQGLWBzq), [`J1Gz138r…`](https://testnet.nearblocks.io/txns/J1Gz138rRPyqpR3SRApWAmMQjx8TzmDWakK1Pqdir1Rh) | **green** |
| The studio goes silent; a stranger releases it | [`HLuEjRGK…`](https://testnet.nearblocks.io/txns/HLuEjRGK5AJNmGe6tyd9KJsiVepRcPxFXYpDcn7cbizC) | released; the world opens, every hash matching ([open](../escrow/handover/12-open.json)) |

**2. The handover, and everything it refuses** ([`web/tests/live/itemsClaim.live.ts`](../../../web/tests/live/itemsClaim.live.ts); an unrelated NEAR account sends every claim, so nothing depends on who submits it):

| Attempt | Transaction | Result |
|---|---|---|
| A claim signed by another player's key | [`7CxQooGD…`](https://testnet.nearblocks.io/txns/7CxQooGDy3MTqkgb7GSLhUzZgx64myPChPyu4rnA2HKv) | refused: "the player's key did not sign this claim" |
| The player's claim with ten times their items | [`6dPsb3Wh…`](https://testnet.nearblocks.io/txns/6dPsb3WhZT7DkMd99mU5uEeCyni9cvz9tAqqK9d9u4Kt) | refused: not under the committed root; nothing signed |
| A claim against a live escrow (`starhaul.encroe.testnet`) | [`21kWbxfz…`](https://testnet.nearblocks.io/txns/21kWbxfzaysXbnzZMpsBDC4WzbXNREhMAuzrPezGWZV8) | refused: not released; nothing signed |
| **The player's own claim: 7 kinds of item to `0x1d9D…615c`** | [`DmdtuSQ6…`](https://testnet.nearblocks.io/txns/DmdtuSQ6nsdkfY473MDXkhztan15ajd7QFMkEVQMNm6H) | **NEAR's MPC network signs it** (digest `0x5c172f4b…`) |
| The same claim again | [`9gd5ysKb…`](https://testnet.nearblocks.io/txns/9gd5ysKbY7ZUxAJSBKTsKjkkcMMVPyCmXLGkDNkBLMGr) | refused: "already claimed" |
| **Anyone relays the signature to Base Sepolia** | [`0x32988609…`](https://sepolia.basescan.org/tx/0x32988609b6244087a6d36408c5208c6b5579bf5dfdf79405552c2a66bd52cd30) | **minted: exactly the sealed items**, item 1 ×1, 2 ×3, 3 ×4, 4 ×4, 5 ×4, 6 ×4, 9 ×3 |
| The same signature relayed again | (refused at estimation) | refused by EncroeItems: "already claimed" |

**3. The same from the site.** On [/revive](https://encroe.vercel.app/revive), a browser holding player 1's game key
revived the world, and the "Take your items to Base Sepolia" panel built the proof from the opened package, signed the
claim with that key, and sent it through the site's relayer (gas only). NEAR's MPC network signed it, and its relay to
Base Sepolia minted player 1's items: [`0xd939546e…`](https://sepolia.basescan.org/tx/0xd939546e70f64eed98003c87cefbb94243bb59bce3f383809c6f678b7dbbcc7a).

The first two lines of [log.jsonl](log.jsonl) are a first attempt whose test read the claim before its callback had
settled; the contract behaved the same both times.

## Disclosed

- **Testnet only**: NEAR testnet and Base Sepolia. The players are scripted; we stopped the studio's heartbeat ourselves.
- **Who paid the gas on Base**: EncroeItems was deployed, and the claim relayed, from the author's other project's
  testnet relayer (Klear's, `0x1d9D…615c`), which also stands in for the player's wallet here. Relaying needs no
  trust: the token contract checks the MPC signature, so any account can relay and nobody can change the claim.
- **What it does not check**: that the released epoch was verified green. The escrow's committed root is the studio's
  word for what each player owns; the enclave's checks are what make that word trustworthy, and they are recorded on
  the escrow for anyone to read.

## Check it yourself

```bash
scripts/near/view.sh encroe-items-ba9e16.testnet config
scripts/near/view.sh encroe-items-ba9e16.testnet get_claim '{"escrow":"handover.encroe.testnet","player":"3b4d97544ab482bb7f83940f2d6db608484d25ee0cdde839876088b70f63ad2f"}'
cast call 0x94365D73B3C539680622E681aEAcefeC01c8a2e1 "signer()(address)" --rpc-url https://sepolia.base.org
cd contracts/encroe-items && cargo test     # the leaf and root match the site's, the digest matches Solidity's
cd contracts/evm && forge test              # mints once, refuses any other signer and any changed claim
```
