"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { nearAccount, send, type Tx } from "./near";

/** The connected NEAR account (null when none). */
export const useNearAccount = () =>
  useSyncExternalStore(nearAccount.subscribe, nearAccount.snapshot, nearAccount.server);

export type TxState =
  { kind: "idle" } | { kind: "signing" } | { kind: "done"; hash: string | null } | { kind: "refused"; reason: string };

/** The contract's own words when a call fails, from an outcome or a thrown error. */
export function failure(x: unknown): string | null {
  const text = typeof x === "string" ? x : JSON.stringify(x ?? null);
  const panic = text.match(/Smart contract panicked: ([^"\\]+)/);
  if (panic) return panic[1].trim();
  return text.includes('"Failure"') ? text.slice(0, 200) : null;
}

/** Sign one transaction with the connected wallet, and keep the hash or the refusal. */
export function useTx() {
  const [state, setState] = useState<TxState>({ kind: "idle" });
  const run = useCallback(async (tx: Tx): Promise<TxState> => {
    setState({ kind: "signing" });
    let next: TxState;
    try {
      const outcome = await send(tx);
      const refused = failure((outcome as { status?: unknown })?.status);
      const hash = (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? null;
      next = refused ? { kind: "refused", reason: refused } : { kind: "done", hash };
    } catch (e) {
      next = { kind: "refused", reason: failure(e) ?? (e instanceof Error ? e.message : String(e)) };
    }
    setState(next);
    return next;
  }, []);
  return { state, run };
}
