import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { packageUrl, revive, type EscrowState, type Sources, type Step } from "./revive";

// encroe-life-52e4.testnet as NEAR returned it after the release, and its package as FastFS serves it.
const dir = path.join(__dirname, "../../../docs/results/escrow/life-52e4");
const state = JSON.parse(readFileSync(path.join(dir, "11-state-released.json"), "utf8")) as EscrowState;
const sealed = new Uint8Array(readFileSync(path.join(dir, "epoch-2/package.sealed")));
const ESCROW = "encroe-life-52e4.testnet";

const from = (s: EscrowState, pkg = sealed): Sources => ({
  state: async () => s,
  sealed: async (url) => {
    expect(url).toBe(packageUrl(s.owner, ESCROW, s.commitment!.pkg_sha256));
    return pkg;
  },
});

describe("reviving a released game from public data", () => {
  it("passes every check and boots the sealed server", async () => {
    const steps: Step[] = [];
    const r = await revive(ESCROW, (s) => steps.push(s), from(state));
    expect(steps.map((s) => s.id)).toEqual([
      "chain",
      "identity",
      "release",
      "package",
      "open",
      "core",
      "players",
      "boot",
    ]);
    expect(steps.every((s) => s.ok)).toBe(true);
    expect(r.pkg.players).toHaveLength(24);
  });

  it("stops at the first check a tampered package fails", async () => {
    const steps: Step[] = [];
    const bad = sealed.slice();
    bad[40] ^= 1;
    await expect(revive(ESCROW, (s) => steps.push(s), from(state, bad))).rejects.toThrow(/committed/);
    expect(steps.at(-1)).toMatchObject({ id: "package", ok: false });
  });

  it("refuses an escrow that has not been released", async () => {
    const live = { ...state, released: null, release_condition_met: false };
    await expect(revive(ESCROW, () => undefined, from(live))).rejects.toThrow(/heartbeat holds/);
    const silent = { ...state, released: null, release_condition_met: true };
    await expect(revive(ESCROW, () => undefined, from(silent))).rejects.toMatchObject({ conditionMet: true });
  });

  it("refuses a release made for another contract", async () => {
    await expect(revive("someone-else.testnet", () => undefined, from(state))).rejects.toThrow(
      /belongs to this contract/,
    );
  });
});
