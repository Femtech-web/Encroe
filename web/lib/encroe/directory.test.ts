import { describe, expect, it } from "vitest";
import type { EscrowStatus } from "../game/near";
import { clock, human } from "./directory";
import { isEscrowId } from "./escrows";

const NOW = 1_800_000_000_000;
const ns = (ms: number) => (BigInt(ms) * 1_000_000n).toString();
const status = (s: Partial<EscrowStatus>) => ({ released_at_ns: null, lapses_at_ns: null, ...s }) as EscrowStatus;

describe("the heartbeat clock", () => {
  it("reads live, silent and released in words", () => {
    expect(clock(status({ lapses_at_ns: ns(NOW + 3 * 86400_000) }), NOW)).toEqual({
      text: "the heartbeat holds for 3 days",
      tone: "live",
    });
    expect(clock(status({ lapses_at_ns: ns(NOW - 2 * 3600_000) }), NOW).tone).toBe("silent");
    expect(clock(status({ released_at_ns: ns(NOW - 60_000) }), NOW).text).toBe("released 60 seconds ago");
    expect(human(45 * 60_000)).toBe("45 minutes");
  });

  it("accepts only Encroe escrow accounts", () => {
    expect(isEscrowId("encroe-embergate.testnet")).toBe(true);
    expect(isEscrowId("matchday.encroe.testnet")).toBe(true);
    expect(isEscrowId("alice.testnet")).toBe(false);
    expect(isEscrowId("x.encroe.testnet.evil.testnet")).toBe(false);
  });
});
