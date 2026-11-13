import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Every move is signed by the player's own ed25519 key, made in their browser. The world indexes players by
 * that key, and the sealed package carries it: after a release, the same key proves the same items are yours.
 */
export type Move =
  | { kind: "join"; name: string }
  | { kind: "gather"; node: number }
  | { kind: "forge"; recipe: number }
  | { kind: "gift"; to: string; item: number; qty: number }
  /** Not a move: asks for this player's inclusion proof. */
  | { kind: "proof" };

export type SignedMove = { pk: string; nonce: number; move: Move; sig: string };

export const DOMAIN = "encroe/embergate/v1";
export const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,15}$/;
const HEX32 = /^[0-9a-f]{64}$/;

/** The exact text a player signs, e.g. `encroe/embergate/v1|<pk>|1731500000000|forge|3`. */
export function moveText(pk: string, nonce: number, move: Move): string {
  const args =
    move.kind === "join"
      ? [move.name]
      : move.kind === "gather"
        ? [move.node]
        : move.kind === "forge"
          ? [move.recipe]
          : move.kind === "gift"
            ? [move.to, move.item, move.qty]
            : [];
  return [DOMAIN, pk, nonce, move.kind, ...args].join("|");
}

export function newSecretKey(): Uint8Array {
  return ed25519.utils.randomSecretKey();
}

export function publicKeyOf(secretKey: Uint8Array): string {
  return bytesToHex(ed25519.getPublicKey(secretKey));
}

export function signMove(secretKey: Uint8Array, move: Move, nonce = Date.now()): SignedMove {
  const pk = publicKeyOf(secretKey);
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(moveText(pk, nonce, move)), secretKey));
  return { pk, nonce, move, sig };
}

export function signatureValid(s: SignedMove): boolean {
  try {
    return ed25519.verify(hexToBytes(s.sig), utf8ToBytes(moveText(s.pk, s.nonce, s.move)), hexToBytes(s.pk));
  } catch {
    return false;
  }
}

const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

/** A request body as a well-formed signed move, or why not. The signature is checked separately. */
export function parseSignedMove(body: unknown): SignedMove | string {
  if (typeof body !== "object" || body === null) return "expected a JSON object";
  const { pk, nonce, move, sig } = body as Record<string, unknown>;
  if (typeof pk !== "string" || !HEX32.test(pk)) return "pk: 32 bytes of lowercase hex";
  if (typeof sig !== "string" || !/^[0-9a-f]{128}$/.test(sig)) return "sig: 64 bytes of lowercase hex";
  if (!int(nonce, 1, Number.MAX_SAFE_INTEGER)) return "nonce: a positive integer (milliseconds)";
  if (typeof move !== "object" || move === null) return "move: an object";
  const m = move as Record<string, unknown>;
  switch (m.kind) {
    case "join":
      return typeof m.name === "string" && NAME.test(m.name)
        ? { pk, nonce, sig, move: { kind: "join", name: m.name } }
        : "name: 2 to 16 letters, digits, spaces, '_', '.' or '-'";
    case "gather":
      return int(m.node, 0, 2 ** 32 - 1) ? { pk, nonce, sig, move: { kind: "gather", node: m.node } } : "node";
    case "forge":
      return int(m.recipe, 0, 2 ** 32 - 1) ? { pk, nonce, sig, move: { kind: "forge", recipe: m.recipe } } : "recipe";
    case "gift":
      if (typeof m.to !== "string" || !HEX32.test(m.to)) return "to: a player's key";
      if (!int(m.item, 0, 2 ** 32 - 1) || !int(m.qty, 1, 2 ** 32 - 1)) return "item, qty";
      return { pk, nonce, sig, move: { kind: "gift", to: m.to, item: m.item, qty: m.qty } };
    case "proof":
      return { pk, nonce, sig, move: { kind: "proof" } };
    default:
      return "move.kind: join, gather, forge, gift or proof";
  }
}
