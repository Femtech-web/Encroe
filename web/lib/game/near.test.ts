import { afterEach, describe, expect, it, vi } from "vitest";
import { query, rpcCall, viewCall } from "./near";

const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: "encroe", result }));
const view = (value: unknown) => ok({ result: [...new TextEncoder().encode(JSON.stringify(value))] });

afterEach(() => vi.unstubAllGlobals());

describe("reading NEAR when an RPC is rate-limited or down", () => {
  it("moves on from a 429, a 5xx and a dead host, in order", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(new URL(url).host);
      if (url.includes("a.test")) return new Response("slow down", { status: 429 });
      if (url.includes("b.test")) return new Response("down", { status: 503 });
      if (url.includes("c.test")) throw new TypeError("fetch failed");
      return ok({ height: 7 });
    });
    const body = await rpcCall<{ height: number }>(
      "block",
      {},
      { rpcs: ["https://a.test", "https://b.test", "https://c.test", "https://d.test"] },
    );
    expect(body.result).toEqual({ height: 7 });
    expect(seen).toEqual(["a.test", "b.test", "c.test", "d.test"]);
  });

  it("takes a chain error as the answer, without asking elsewhere", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: { message: "UNKNOWN_ACCOUNT", cause: { name: "UNKNOWN_ACCOUNT" } } }),
      );
    });
    await expect(viewCall("nobody.testnet", "status", {}, "https://a.test")).rejects.toThrow("UNKNOWN_ACCOUNT");
    expect(calls).toBe(1);
  });

  it("says which RPC failed last when none answers", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    await expect(rpcCall("block", {}, { rpcs: ["https://a.test", "https://b.test"] })).rejects.toThrow(
      "b.test: HTTP 502",
    );
  });

  it("makes identical views in flight once, and keeps them for a few seconds", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => (calls++, view({ phase: "live" })));
    const params = {
      request_type: "call_function",
      account_id: "x.testnet",
      method_name: "status",
      args_base64: "e30=",
    };
    const rpcs = ["https://cache.test"];
    await Promise.all([query(params, rpcs), query(params, rpcs), query(params, rpcs)]);
    await query(params, rpcs);
    expect(calls).toBe(1);
  });
});
