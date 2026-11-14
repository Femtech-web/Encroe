# An AI agent nobody wrote for Encroe releases a silent studio's game and brings it back (2026-11-14)

**The claim:** preserving a dead game is a job any agent can do, with nothing but Encroe's public MCP server. The
agent here is **Claude Code 2.1.325, unmodified**, run headless with every built-in tool turned off (`--tools ""`)
and one MCP server allowed: the live site's, `https://encroe.vercel.app/api/mcp`. It got a four-sentence task
([task.txt](task.txt)), no account and no key; the site's relayer pays the gas of a release, which anyone may send.

```bash
claude -p "$(cat task.txt)" --mcp-config mcp.json --strict-mcp-config --tools "" --allowedTools mcp__encroe \
  --output-format stream-json --verbose --max-turns 40 --no-session-persistence > transcript.jsonl
```

## What it did ([transcript](transcript.jsonl), [its report](report.md))

| Step | Tool | Result |
|---|---|---|
| Surveyed every escrow, and the preservation agent's log | `list_escrows`, `agent_log` | 15 escrows; two silent: `encroe-kill-5609`, `encroe-kill-19d2` |
| Inspected **both** before acting | `inspect_escrow` | 0 access keys, the published code `08d9174f…`, epoch 1 verified green (TCB `UpToDate`), silent 10 hours past its grace |
| Released one | `release_escrow` | [`zCcjj8SV…`](https://testnet.nearblocks.io/txns/zCcjj8SVEB7r43tPGxVdXJHeAbyvsFyz693FQ4RGhN4); it left the other for someone else |
| Waited for NEAR's MPC network | `inspect_escrow` ×3 | `silent` → `releasing` → `released` |
| Brought the game back from public data | `bring_back` | **all 8 checks**: the key is this contract's, the MPC signed it, the package's hash, the decryption, the verified core, every player's items under NEAR's root, a boot with 0 imports. Embergate, 5 players, 35 items |

10 turns, 48 seconds, $0.16 of model time.

## The one moment, measured on chain

| | Chain time | |
|---|---|---|
| The release transaction lands | block `GTTBvZZi…`, t = 0 | sent by the agent through the site |
| NEAR's MPC network publishes the key | **t = 4.8 s** | `released_at_ns` |
| The game is back, every check passed | **t = 17.5 s** | the site's `bring_back`, server clock |

## Disclosed

- The studio's silence was ours: `encroe-kill-5609` is one of the silent studios we left for visitors to release.
- The release was paid by the site's relayer (`encroe-relay-3778.testnet`), as for any visitor; the escrow's rule, not
  the relayer, decided it could be released.
