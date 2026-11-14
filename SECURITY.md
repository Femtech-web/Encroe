# Security

## Networks

Encroe runs on NEAR **testnet** only. No mainnet transaction has been sent, and no account in this repository holds
anything of value.

## Secrets

- Testnet keys live in `~/.near-credentials` (NEAR CLI's keychain); sealed epochs' keys and players' salts in
  `.secrets/`; account ids and the studio token in `.env` and `web/.env.local`. None is ever committed: a gitleaks
  pre-commit hook (`.githooks/`) and CI refuse them.
- The site's relayer (`ENCROE_RELAYER_*`) is a throwaway testnet account that only pays gas for calls anyone may
  make. The studio workflow's keys reach GitHub's runner as one encrypted secret and are deleted when it ends.
- Public by design: sealed packages (encrypted), commitments, transactions and run records in `docs/results/`.

## What to read first

[docs/trust.md](docs/trust.md) (what you trust, and how to check it), [docs/threat-model.md](docs/threat-model.md)
and [docs/properties.md](docs/properties.md) (what Encroe guarantees, and the test that holds each).

## Reporting a vulnerability

Open a private security advisory on this repository (Security → Report a vulnerability), or an issue without
details asking for a contact. We answer within a few days.
