import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATTACKS } from "./attacks";

const src = path.join(__dirname, "../../../contracts/encroe-escrow/src");
const contract = readdirSync(src)
  .map((f) => readFileSync(path.join(src, f), "utf8"))
  .join("\n");

describe("the attacks on /break", () => {
  it("each expects a refusal the escrow contract itself writes", () => {
    for (const a of ATTACKS) expect(contract, a.id).toContain(a.expected);
    expect(new Set(ATTACKS.map((a) => a.id)).size).toBe(ATTACKS.length);
  });

  it("replays a real quote at a run it was not made for", async () => {
    const replay = ATTACKS.find((a) => a.id === "replay-quote")!;
    const args = (await replay.args()) as { index: number; quote: string };
    expect(args.index).toBe(2);
    expect(args.quote.length).toBeGreaterThan(1000);
  });
});
