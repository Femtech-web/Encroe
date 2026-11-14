import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Items } from "./items";
import { signMove, type Move } from "./moves";

/** The player's key lives in this browser only; the game never sees it, only its signatures. */
const KEY = "encroe:embergate:sk";

export function loadKey(): Uint8Array | null {
  try {
    const hex = localStorage.getItem(KEY);
    return hex && /^[0-9a-f]{64}$/.test(hex) ? hexToBytes(hex) : null;
  } catch {
    return null;
  }
}

export function saveKey(sk: Uint8Array): void {
  localStorage.setItem(KEY, bytesToHex(sk));
}

export function forgetKey(): void {
  localStorage.removeItem(KEY);
}

/** The name is the server's, not sealed; kept here so a revived world can still greet its player. */
export function loadName(): string | null {
  try {
    return localStorage.getItem(`${KEY}:name`);
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  localStorage.setItem(`${KEY}:name`, name);
}

export type Me = { name: string; items: Items; next_gather_at: number; nonce: number };

let lastNonce = 0;

/** Signs and plays a move; nonces strictly increase even within one millisecond. */
export async function send<T = Me>(sk: Uint8Array, move: Move, url = "/api/move", game = "embergate"): Promise<T> {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(signMove(sk, move, lastNonce, game)),
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
