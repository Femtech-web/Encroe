import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * The FastFS payload the CLI's `fastfs-payloads` writes for a file up to 1 MiB: `0u8 ‖ borsh(SimpleFastfs {
 * relative_path: "<sha256>.sealed", content: Some({ mime_type, content }) })`, sent as the raw arguments of a
 * `__fastdata_fastfs` call. FastFS serves it at test.fastfs.io/<signer>/<receiver>/<relative_path>.
 */
export function fastfsPayload(
  file: Uint8Array,
  ext = "sealed",
  mime = "application/octet-stream",
): { name: string; payload: Uint8Array } {
  if (file.length > 1 << 20) throw new Error("a single FastFS payload holds up to 1 MiB");
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  };
  const str = (s: string) => {
    const b = utf8ToBytes(s);
    return concatBytes(u32(b.length), b);
  };
  const name = `${bytesToHex(sha256(file))}.${ext}`;
  return {
    name,
    payload: concatBytes(new Uint8Array([0]), str(name), new Uint8Array([1]), str(mime), u32(file.length), file),
  };
}
