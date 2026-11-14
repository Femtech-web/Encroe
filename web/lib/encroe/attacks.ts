import { viewState, packageUrl } from "./revive";
import replay from "./data/replay-40727-run2.json";

/**
 * Ways to try to cheat an escrow, each sent for real from a throwaway account against a live, locked escrow on
 * NEAR testnet. Every one is refused by the contract itself; the page shows the transaction and the refusal.
 */
export type Attack = {
  id: string;
  title: string;
  /** What the attacker hopes to get. */
  goal: string;
  escrow: string;
  method: string;
  /** The contract's own words when it refuses. */
  expected: string;
  args: () => Promise<Record<string, unknown>>;
  tgas: number;
};

const LIVE = "encroe-embergate.testnet";
const RELEASED = "encroe-kill-beaa.testnet";
const LIFE = "encroe-life-52e4.testnet";

export const ATTACKS: Attack[] = [
  {
    id: "early-release",
    title: "Release a living studio's game",
    goal: "Take the key while the studio still sends its heartbeat, and walk off with its server.",
    escrow: LIVE,
    method: "release",
    expected: "release condition not met",
    args: async () => ({}),
    tgas: 100,
  },
  {
    id: "fake-heartbeat",
    title: "Keep a dead studio's game locked",
    goal: "Send heartbeats for a studio that has gone, so its players never get their game.",
    escrow: LIVE,
    method: "heartbeat",
    expected: "owner only",
    args: async () => ({}),
    tgas: 30,
  },
  {
    id: "fake-seal",
    title: "Seal a fake world over the real one",
    goal: "Commit a new epoch whose items and core are someone else's.",
    escrow: LIVE,
    method: "commit",
    expected: "owner only",
    args: async () => ({
      commitment: {
        game: "embergate",
        epoch: 999,
        ckd_pk: "bls12381g2:fake",
        app_id: "00".repeat(32),
        sealed_u: "00".repeat(96),
        sealed_v: "00".repeat(32),
        pkg_sha256: "11".repeat(32),
        root: "22".repeat(32),
        core_sha256: "33".repeat(32),
        players: 64,
      },
    }),
    tgas: 30,
  },
  {
    id: "tampered-package",
    title: "Get a tampered build verified",
    goal: "Have the enclave check a package with one byte changed, and earn a green badge for it.",
    escrow: LIVE,
    method: "verify",
    expected: "package does not match the committed pkg_sha256",
    args: async () => {
      const s = await viewState(LIVE);
      const c = s.commitment!;
      const res = await fetch(packageUrl(s.owner, LIVE, c.pkg_sha256), { cache: "no-store" });
      const bytes = new Uint8Array(await res.arrayBuffer());
      bytes[Math.floor(bytes.length / 2)] ^= 1;
      return { package_b64: Buffer.from(bytes).toString("base64") };
    },
    tgas: 100,
  },
  {
    id: "replay-quote",
    title: "Reuse an enclave's proof for another run",
    goal: "Take a real Intel TDX quote that NEAR accepted for one run and pass it off for a different run.",
    escrow: LIFE,
    method: "prove_run",
    expected: "input differs",
    args: async () => replay as Record<string, unknown>,
    tgas: 300,
  },
  {
    id: "second-release",
    title: "Release a game twice",
    goal: "Ask NEAR's MPC network for the key again, after the game already went to its players.",
    escrow: RELEASED,
    method: "release",
    expected: "already released",
    args: async () => ({}),
    tgas: 100,
  },
];

export const attack = (id: unknown) => ATTACKS.find((a) => a.id === id);
