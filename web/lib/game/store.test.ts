import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "./store";

describe("FileStore", () => {
  it("writes only over the revision it read", async () => {
    const store = new FileStore(mkdtempSync(path.join(tmpdir(), "encroe-store-")));
    expect(await store.get("world")).toBeNull();
    expect(await store.put("world", { a: 1 }, 0)).toBe(true);
    expect(await store.put("world", { a: 2 }, 0)).toBe(false);
    expect(await store.get("world")).toEqual({ value: { a: 1 }, rev: 1 });
    const [x, y] = await Promise.all([store.put("world", { a: 3 }, 1), store.put("world", { a: 4 }, 1)]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
  });

  it("counts hits in a window", async () => {
    const store = new FileStore(mkdtempSync(path.join(tmpdir(), "encroe-store-")));
    expect(await store.hit("ip", 60)).toBe(1);
    expect(await store.hit("ip", 60)).toBe(2);
  });
});
