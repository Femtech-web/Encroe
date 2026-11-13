# Encore: what is left, and what would make it exceptional

*Written 2026-11-12, to resume after Keel's live run. Deadline: the NEAR hackathon, 2026-11-14.*

## Where Encore stands

| Gate | Status | Evidence |
|---|---|---|
| E1: the recovery key exists only in NEAR's MPC network and is released publicly once the publisher's heartbeat lapses or end of life is due | **live PASS**, on an unlocked contract (`encore-e1-6b4dad`, 240 s grace) | `GO_NO_GO.md` §E1, heartbeat `GeCzs6VK…` |
| E2: only the pinned verifier, run through the contract, can use the publisher's secret; a thief build and a direct call cannot | **live PASS**, on the **locked** `encore-e2-6b4dad` via the end-of-life path | `GO_NO_GO.md` §E2 |
| E3: the TDX quote of a verification run verifies against Intel PCS, bound to the exact input and output | **live PASS** | `docs/results/e3` |
| T1: the contract accepts a run only after NEAR's own DCAP verifier checks its quote; a replayed quote is refused | **live PASS** on `t1.encore-pub-6b4dad` (**not locked**: 1 key) | `GO_NO_GO.md` §T1 |

The silent-studio release (the dead-man switch) is **already built**: `release_condition_met` is true when the
publisher's heartbeat lapses past `grace_ns` *or* an end-of-life date arrives, and anyone may then call
`release`. It has only been shown live on the unlocked E1 contract.

## The plan, in order

### 1. One locked contract, the whole story, the silent-studio path

Deploy `contracts/encore-t1` to a fresh account and lock it (delete its only key) **before** sealing anything.
Then run, with every transaction recorded:

1. `commit` the sealed epoch; `refresh_measurements`.
2. The publisher sends heartbeats, then **stops** (a disclosed simulation of a studio that disappears).
3. After `grace_ns`, a stranger calls `release`: the MPC network releases the key publicly.
4. `verify` runs the pinned verifier on OutLayer; `prove_run` gets it accepted only after NEAR's DCAP verifier
   checks the quote.
5. Negative checks on the same contract: `release` before the lapse is refused; a replayed quote is refused;
   the publisher (or anyone) cannot change the commitment after the lock.

**Headline this becomes:** *even if the studio disappears, the game doesn't.*
**Done when:** a judge-facing table links every step on the locked contract, and `view_access_key_list` shows 0.
**Effort:** about half a day (all the pieces exist; Keel's `g7.sh` is the model for the runbook).

### 2. The visible moment: a real game server comes back

Seal a small open-source multiplayer game server as the epoch's package. After the release in step 1:
1. a stranger decrypts the package with the publicly released key;
2. starts the server;
3. a real client connects and plays;
4. the contract shows that this exact build (its hash) was verified in a TEE.

**Why:** today we prove the mechanism; this shows the outcome a player cares about. It is the scene judges
remember.
**To decide first:**
- **Which server.** It should be small, open source, and run in seconds; a text or browser game is enough.
- **Packaging.** Check how `core_sha256`/`root` in the commitment map to its files.
**Done when:** a short screen recording shows the decrypt → run → connect sequence, next to the transaction that
released the key and the accepted run.
**Effort:** a few hours once the server is chosen; the risk is packaging, not the chain side.

### 3. A preservation agent

An agent that does, automatically and without privilege, what the stranger does by hand:
- **Watch:** it checks `release_condition_met` (the publisher's heartbeat) on the locked contract.
- **Act:** the moment the condition holds, it calls `release`, fetches and checks the package, and requests the verified run (`verify` then `prove_run`).
- **Restore:** it brings the server up for players.

**The honest framing:** the trigger is verified on-chain by the contract, so the agent adds automation, not
trust, exactly like Keel's guardians.
**An AI is optional**, and only where it does real work. One real job: an AI play-tester that connects to the
restored server and reports that the game actually works. It reports; it decides nothing on-chain.
**Effort:** the watcher and executor take about 2 hours (Keel's `agents/guardian.py` is the template). The AI
play-tester depends on step 2's game.

### 4. Submission

- **Judge-facing README** with:
  - the one-line story;
  - the trust model (MPC CKD, OutLayer TDX plus on-chain DCAP, the lock);
  - a table of every live transaction;
  - honest limits (testnet, not audited, OutLayer worker keys).
- **A 2–3 minute video:** the studio goes silent, a stranger releases, a verified run, the server comes back.
- **The submission form;** whether to make the repo public (the user's call).

## Order

1, then 3 (it automates 1), then 2 if time allows, then 4. Items 1 and 3 fit in a day; item 2 depends on the
game chosen.
