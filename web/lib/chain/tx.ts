import { createHash, createPrivateKey, sign } from "node:crypto";
import { RPC } from "@/lib/game/near";
import { base58Decode } from "@/lib/encroe/release";

/** One NEAR function call, signed on the server with a full-access ed25519 key (ported from Klear's tx.ts). */

class Borsh {
  private parts: Buffer[] = [];
  u8(n: number) {
    this.parts.push(Buffer.from([n]));
  }
  u32(n: number) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    this.parts.push(b);
  }
  u64(n: bigint) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n);
    this.parts.push(b);
  }
  u128(n: bigint) {
    this.u64(n & 0xffffffffffffffffn);
    this.u64(n >> 64n);
  }
  bytes(b: Uint8Array) {
    this.u32(b.length);
    this.parts.push(Buffer.from(b));
  }
  fixed(b: Uint8Array) {
    this.parts.push(Buffer.from(b));
  }
  string(s: string) {
    this.bytes(Buffer.from(s, "utf8"));
  }
  done(): Buffer {
    return Buffer.concat(this.parts);
  }
}

/** The borsh bytes of a Transaction with one FunctionCall action (nearcore's layout). */
export function encodeTransaction(t: {
  signer: string;
  publicKey: Uint8Array;
  nonce: bigint;
  receiver: string;
  blockHash: Uint8Array;
  method: string;
  args: Uint8Array;
  gas: bigint;
  deposit: bigint;
}): Buffer {
  const w = new Borsh();
  w.string(t.signer);
  w.u8(0); // ed25519
  w.fixed(t.publicKey);
  w.u64(t.nonce);
  w.string(t.receiver);
  w.fixed(t.blockHash);
  w.u32(1);
  w.u8(2); // Action::FunctionCall
  w.string(t.method);
  w.bytes(t.args);
  w.u64(t.gas);
  w.u128(t.deposit);
  return w.done();
}

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (; n > 0n; n /= 58n) out = B58[Number(n % 58n)] + out;
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

/** Calls sent back to back see a nonce the chain has not reported yet; never reuse one this process has sent. */
const sentNonce = new Map<string, bigint>();
function nextNonce(signer: string, chain: bigint): bigint {
  const n = [chain + 1n, (sentNonce.get(signer) ?? 0n) + 1n].reduce((a, b) => (a > b ? a : b));
  sentNonce.set(signer, n);
  return n;
}

async function rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "encroe", method, params }),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: unknown };
  if (!body.result) throw new Error(`NEAR RPC ${method}: ${JSON.stringify(body.error ?? res.status).slice(0, 200)}`);
  return body.result;
}

/** The runtime's failure as the short reason a person can read; null when the call succeeded. */
export function refusalOf(status: unknown): string | null {
  if (typeof status !== "object" || status === null || !("Failure" in status)) return null;
  const text = JSON.stringify((status as { Failure: unknown }).Failure);
  const panic = text.match(/Smart contract panicked: ([^"\\]+)/);
  if (panic) return panic[1].trim();
  if (text.includes("MethodNotFound")) return "no such method";
  return text.slice(0, 160);
}

export type Sent = { hash: string; refusal: string | null };

/**
 * Signs and sends the call. By default it returns once the call is included in a final block: calls that wait on
 * NEAR's MPC network (a release) take longer to finish than an RPC request lives, so the caller watches the
 * contract's state instead. `settle` waits for the outcome, for calls expected to finish (or be refused) at once.
 */
export async function functionCall(
  signer: string,
  secretKey: string,
  receiver: string,
  method: string,
  args: Record<string, unknown>,
  tgas = 30,
  options: { settle?: boolean; depositYocto?: bigint } = {},
): Promise<Sent> {
  const raw = base58Decode(secretKey.replace(/^ed25519:/, ""));
  if (raw.length !== 64) throw new Error("expected a 64-byte ed25519 secret key");
  const seed = Buffer.from(raw.slice(0, 32));
  const publicKey = raw.slice(32);
  const access = await rpc("query", {
    request_type: "view_access_key",
    finality: "optimistic",
    account_id: signer,
    public_key: `ed25519:${base58Encode(publicKey)}`,
  });
  const tx = encodeTransaction({
    signer,
    publicKey,
    nonce: nextNonce(signer, BigInt(access.nonce as number)),
    receiver,
    blockHash: base58Decode(access.block_hash as string),
    method,
    args: Buffer.from(JSON.stringify(args)),
    gas: BigInt(tgas) * 10n ** 12n,
    deposit: options.depositYocto ?? 0n,
  });
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  const signature = sign(null, createHash("sha256").update(tx).digest(), key);
  const signed = Buffer.concat([tx, Buffer.from([0]), signature]);
  const r = await rpc("send_tx", {
    signed_tx_base64: signed.toString("base64"),
    wait_until: options.settle ? "EXECUTED_OPTIMISTIC" : "INCLUDED_FINAL",
  });
  return { hash: (r.transaction as { hash: string }).hash, refusal: options.settle ? refusalOf(r.status) : null };
}
