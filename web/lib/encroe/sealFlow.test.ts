import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storeArgs, VERIFIER_HASH } from "./outlayer";
import { near, nextEpoch, requestIdOf, storeDeposit, verifyDeposit } from "./sealFlow";

describe("sealing from the browser, on chain", () => {
  it("finds OutLayer's request id where the CLI's record found it", () => {
    const text = readFileSync(
      path.join(__dirname, "../../../docs/results/escrow/matchday/07-verify-1-1794619240.txt"),
      "utf8",
    );
    const event = text.split("\n").find((l) => l.includes("execution_requested"))!;
    const outcome = { receipts_outcome: [{ outcome: { logs: [event.slice(event.indexOf("EVENT_JSON"))] } }] };
    expect(requestIdOf(outcome)).toBe(41838);
    expect(requestIdOf({ status: { SuccessValue: "" } })).toBeNull();
  });

  it("pays what the script pays", async () => {
    const view = async <T>(_a: string, method: string, args: object = {}) => {
      if (method === "estimate_storage_cost") expect((args as { owner: string }).owner).toBe("studio.testnet");
      if (method === "estimate_execution_cost") expect((args as { input_len: number }).input_len).toBe(2 * 1000 + 4096);
      return (method === "estimate_storage_cost" ? "1000000000000000000000" : "71250000000000000000000") as T;
    };
    expect(await storeDeposit(storeArgs("encroe-x-2", "x.encroe.testnet", "AQ=="), "studio.testnet", view)).toBe(
      1_200_000_000_000_000_000_000n,
    );
    expect(near(await verifyDeposit(1000, view))).toBe("0.1425 NEAR");
    expect(nextEpoch(null)).toBe(1);
    expect(nextEpoch({ epoch: 4 })).toBe(5);
  });

  it("gates the key row to the pinned verifier and this escrow alone", () => {
    const a = storeArgs("encroe-x-2", "x.encroe.testnet", "AQ==");
    expect(a.accessor.WasmHash.hash).toBe(VERIFIER_HASH);
    expect(a.access.Logic.conditions).toEqual([
      { WasmHash: { hash: VERIFIER_HASH } },
      { Predecessor: { condition: { Whitelist: { accounts: ["x.encroe.testnet"] } } } },
    ]);
  });
});
