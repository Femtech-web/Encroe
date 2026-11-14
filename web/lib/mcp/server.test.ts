import { describe, expect, it } from "vitest";
import { handle } from "./server";

describe("Encroe's MCP server", () => {
  it("negotiates a protocol version and names itself", async () => {
    const r = (await handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    })) as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(r.result.protocolVersion).toBe("2025-06-18");
    expect(r.result.serverInfo.name).toBe("encroe");
  });

  it("lists its tools, marking the one that sends a transaction", async () => {
    const r = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    const tools = Object.fromEntries(r.result.tools.map((t) => [t.name, t.annotations.readOnlyHint]));
    expect(Object.keys(tools)).toEqual([
      "list_escrows",
      "inspect_escrow",
      "release_escrow",
      "bring_back",
      "find_my_items",
      "agent_log",
    ]);
    expect(
      Object.entries(tools)
        .filter(([, ro]) => !ro)
        .map(([n]) => n),
    ).toEqual(["release_escrow"]);
  });

  it("refuses unknown tools and accounts that are not escrows, and ignores notifications", async () => {
    expect(await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "drain" } })).toMatchObject({
      error: { code: -32602 },
    });
    const bad = (await handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "release_escrow", arguments: { escrow: "alice.testnet" } },
    })) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
});
