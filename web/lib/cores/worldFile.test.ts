import { describe, expect, it } from "vitest";
import { checkWorld } from "./worldFile";

const pk = (b: string) => b.repeat(64);

describe("the world-file checker on /tools", () => {
  it("accepts what encore seal accepts", () => {
    const r = checkWorld(
      JSON.stringify([
        {
          pk: pk("a"),
          items: [
            [1, 3],
            [2, 2],
          ],
        },
        { pk: pk("b"), items: [] },
      ]),
    );
    expect(r.issues).toEqual([]);
    expect(r.summary).toEqual({ players: 2, kinds: 2, items: 5, bytes: 4 + 36 + 16 + 36 });
  });

  it("names what it refuses", () => {
    const r = checkWorld(
      JSON.stringify([
        { pk: "XYZ", items: [] },
        { pk: pk("c"), items: Array.from({ length: 17 }, (_, i) => [i + 1, 1]) },
        { pk: pk("c"), items: [[1, -1]] },
      ]),
    );
    expect(r.issues).toEqual([
      "player 0: pk must be 64 lowercase hex characters",
      "player 1: at most 16 kinds of item, not 17",
      "player 2: the same key twice",
      "player 2: [1,-1] is not [id, qty] with u32 numbers",
    ]);
    expect(checkWorld("[]").issues).toEqual(["a world has 1 to 64 players, not 0"]);
  });
});
