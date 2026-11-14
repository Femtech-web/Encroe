# Changelog

## v0.1.0

The first release: [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md).

- The escrow contract (`contracts/encroe-escrow`): epochs, heartbeat, end of life, release through NEAR's MPC network,
  verification runs accepted only after NEAR's DCAP verifier checks their TDX quote; locked before sealing.
- The factory and directory (`contracts/encroe-factory`), live at `encroe.testnet`: escrows keyless from birth.
- Three live games on the site (`/play`): one signed-move API for every game, `/api/games/[game]/…`.
- The studio console on each escrow page: heartbeat and end of life, signed by the studio's wallet.
- Sealing (`crates/encore-crypto`, `crates/encore-cli`), the pinned verifier (`crates/encore-verifier`), an
  independent TDX quote check (`crates/encore-attest`).
- Game cores in Rust (Embergate), C++ (Matchday) and C (Neon City), built with cargo and Zig; the interface any core
  exports (`cores/README.md`).
- The site: the game, the vault check, revive and play on, kill a studio, try to break it, the directory and escrow
  pages, studios' wallet flow, tools, the preservation agent, the MCP server, the judges' path.
- The studio's bot and scheduled workflows (`studio.yml`, `preserve.yml`), CI (`ci.yml`).
- Recorded runs on testnet: life-52e4, ember-3924, kill-827e, kill-beaa, matchday-5d60, neon-city-19f9, embergate.
- Trust, threat model, properties and security docs.
