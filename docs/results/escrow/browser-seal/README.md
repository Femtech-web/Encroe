# Sealed from the browser: Neon City's world, sealed, committed and verified without our tools (2026-11-14)

The claim: a studio needs nothing but a browser and a NEAR wallet to seal its world. The sealing runs in
[`web/lib/encroe/seal.ts`](../../../../web/lib/encroe/seal.ts), the code [/studios/seal](https://encroe.vercel.app/studios/seal)
runs in the studio's tab. The package key leaves the tab only inside a key row encrypted to OutLayer's keystore. The site's relayer puts the
package on NEAR (FastFS), and it only takes a package whose hash the escrow already holds. The enclave and NEAR's DCAP
verifier then judge it exactly as they judge the Rust CLI's seals.

- **The escrow**: `neon-city.encroe.testnet`, made by the factory, 0 access keys, escrow build `08d9174f…`.
- **The world**: the two players of our local dev server's Neon City (the public site's Neon City had none yet),
  exported as the studio workflow exports it. Disclosed: these are our own test players.
- **The signer**: [`tests/live/browserSeal.live.ts`](../../../../web/tests/live/browserSeal.live.ts) runs the page's
  code path and signs with the studio's key where the page asks a wallet. The page itself was checked in a browser up
  to the wallet (core and players checks pass, sealing waits for the studio's wallet).

| # | Step | Transaction | Result |
|---|---|---|---|
| 1 | Seal epoch 2 in the browser's code: 2 players, core `3f4a1e62…` | | package `d4a9e7b9…` |
| 2 | Key row to OutLayer's keystore (`encroe-neon-city-2`), readable only by verifier `9c0eb2e7…` called by this escrow | [`BdEWUTX3…`](https://testnet.nearblocks.io/txns/BdEWUTX3eFY53hrigEiirkLfjXxkgiVkdxJwFyRnAxU3) | stored |
| 3 | Commit the epoch | [`2kNgyyNy…`](https://testnet.nearblocks.io/txns/2kNgyyNybDFk6JU1Lawe8dXHWbTbNogprqn2fpbaK5f3) | [commitment](epoch-2/commitment.json) |
| 4 | The relayer puts the package on FastFS (`/api/seal/fastfs`) | [`2DwKbazD…`](https://testnet.nearblocks.io/txns/2DwKbazDKSfrD5fBmc866JzscxppRGDqptJDaxwvy2Et) | [served back](https://test.fastfs.io/encroe-relay-3778.testnet/neon-city.encroe.testnet/d4a9e7b9d2d41c02212943d9b5e6f96a6b1d54666a90ec19b0e5bc3b4da39fbe.sealed), sha256 matches |
| 5 | The enclave runs the pinned verifier on it (OutLayer request 41937) | [`6uzmrySm…`](https://testnet.nearblocks.io/txns/6uzmrySmz65rTedQahxYEPGShFFa9voVfBXhuKzFabL3) | run 0: every check passed |
| 6 | Queued for the prover (`/api/seal/prove`); the prover relays the quote, as [prove.yml](../../../../.github/workflows/prove.yml) does | [`J6iH7fu4…`](https://testnet.nearblocks.io/txns/J6iH7fu4dz6cgNU6kW4Fy5efW9kdNZ2DDNhGZK4fcJGe) | **green**: NEAR's DCAP verifier accepts, TCB `UpToDate` ([check](prove/attestation-41937-check.json)) |

## Epoch 1 is stranded, and why

The first try committed epoch 1 ([`AaTVP5Mu…`](https://testnet.nearblocks.io/txns/AaTVP5Mu5osVjovANGbK5CLpi4G89k1dWbDPJPSbXdK1))
but the relayer route read the escrow before the commit was final and refused the package. The script held the package
only in memory, so epoch 1 can never be verified or opened. Fixed both ways: the route waits for the commit to be final,
and the package is kept before anything is sent (the page keeps it in the studio's browser and resumes from it). The
escrow moved on to epoch 2 above; epochs only move forward, so nothing was rewritten.

## Check it yourself

```bash
scripts/near/view.sh neon-city.encroe.testnet status     # badge green, epoch 2, proven run 0
cd web && npx vitest run lib/encroe                      # the browser's sealing opened by the code that opens real releases,
                                                         # its key rows opened as OutLayer's keystore opens them
```
