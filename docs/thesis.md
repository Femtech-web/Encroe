# Encroe: the thesis

Every piece of Encroe (the contract, the game, the site, the film, the README) serves this. If a feature does not,
it waits.

## The problem

**Every online game has a kill switch, and only the studio holds it.** When a studio turns off its servers, players
lose a game they paid for and everything they earned in it. The Crew's servers went dark in 2024; Anthem became
unplayable on 12 January 2026. 1.29 million Europeans signed the Stop Killing Games initiative, and the EU declined to
legislate. A studio's promise of an "end-of-life plan" cannot be enforced: by the time it matters, the studio is gone.

## The answer

**Encroe makes "the game will outlive us" a promise nobody can break.**

1. **The studio seals its server into escrow on NEAR**: the game's server core and a snapshot of every player's items,
   encrypted to a key that exists only inside NEAR's MPC network.
2. **While the studio lives, anyone can check the escrow is real, without opening it.** An enclave decrypts the
   sealed build, runs it, and checks it serves every sampled player's items exactly and conserves items across trades.
   NEAR's own DCAP verifier checks the enclave's Intel TDX quote before the contract accepts the result. A broken build
   turns the badge red for everyone.
3. **Each player can check their own items are inside**, against the root NEAR holds, without revealing anyone else's.
4. **The studio keeps a heartbeat.** If it goes silent past its grace period, or declares end of life, **anyone** (a
   player, a fan, an AI agent) can trigger the release. The contract has no keys; nobody can stop it or move it early.
5. **The game comes back**: the MPC network publishes the key, anyone decrypts the package, checks it is exactly the
   build the enclave verified, and runs the server, with everyone's items intact.

No lawyer, no escrow agent, no permission, no key anyone holds.

## Why only NEAR

- **The key**: NEAR's MPC network derives a key for this contract's identity and releases it only when the contract
  asks (CKD used as identity-based encryption). Before that, nobody holds it: not the studio, not us.
- **The proof**: NEAR's DCAP verifier checks Intel TDX quotes on chain, so the contract trusts the hardware, not an
  operator.
- **The rules**: a contract with no access keys is final.

## The one line

**The studio shut down. The game didn't.**
