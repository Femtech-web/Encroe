import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fastfsPayload } from "./fastfs";

const sealed = new Uint8Array(
  readFileSync(path.join(__dirname, "../../../docs/results/escrow/kill-beaa/epoch-1/package.sealed")),
);
const CLI = path.join(__dirname, "../../../target/release/encore");

describe("the FastFS payload", () => {
  it("names the file by its hash", () => {
    expect(fastfsPayload(sealed).name).toBe("29f0cfa48cfa6719bc22915a5e4b9b922e62e942aa02dd6dc3e55d41ada29540.sealed");
  });

  it.skipIf(!existsSync(CLI))("is byte for byte what the CLI's fastfs-payloads writes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "encroe-fastfs-"));
    const file = path.join(__dirname, "../../../docs/results/escrow/kill-beaa/epoch-1/package.sealed");
    const r = spawnSync(CLI, [
      "fastfs-payloads",
      "--file",
      file,
      "--out-dir",
      dir,
      "--ext",
      "sealed",
      "--mime",
      "application/octet-stream",
    ]);
    expect(r.status, r.stderr.toString()).toBe(0);
    expect(fastfsPayload(sealed).payload).toEqual(new Uint8Array(readFileSync(path.join(dir, "payload-0.bin"))));
  });
});
