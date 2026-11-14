"use client";

import type { NearConnector } from "@hot-labs/near-connect";
import { RPCS } from "@/lib/game/near";
import wallets from "@/lib/wallet/wallets.json";

/** One NEAR transaction as NEAR Connect takes it. */
export interface Tx {
  receiverId: string;
  actions: {
    type: "FunctionCall";
    params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string };
  }[];
}

/**
 * The NEAR wallet, through NEAR Connect (the connector NEAR's docs recommend). Wallets run in sandboxed
 * iframes; the list is pinned to the four that support testnet (wallets.json, from NEAR Connect's own
 * manifest), and they read NEAR through the site's RPCs, FastNEAR's first. The page's account is a tiny external store for React. (Ported from Klear.)
 */

let connector: NearConnector | null = null;
let account: string | null = null;
const listeners = new Set<() => void>();
const set = (next: string | null) => {
  account = next;
  listeners.forEach((l) => l());
};

async function get(nonce?: string): Promise<NearConnector> {
  const { NearConnector } = await import("@hot-labs/near-connect");
  if (connector) return connector;
  connector = new NearConnector({
    network: "testnet",
    manifest: structuredClone(wallets) as never,
    features: { testnet: true, signAndSendTransaction: true },
    autoConnect: false,
    providers: { testnet: RPCS },
    cspNonce: nonce,
    footerBranding: null,
  });
  connector.on("wallet:signIn", (e: { accounts: { accountId: string }[] }) =>
    set(testnetAccount(e.accounts[0]?.accountId)),
  );
  connector.on("wallet:signOut", () => set(null));
  // A wallet connected on an earlier visit.
  connector
    .wallet()
    .then(async (w) => set(testnetAccount((await w.getAccounts())[0]?.accountId)))
    .catch(() => {});
  return connector;
}

export const nearAccount = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  snapshot: () => account,
  server: () => null,
};

/** Restore an earlier session without opening anything. */
export const restore = (nonce?: string) => void get(nonce).catch(() => {});

function testnetAccount(id?: string): string | null {
  return id && (/^[a-z0-9_.-]+\.testnet$/.test(id) || /^[a-f0-9]{64}$/.test(id)) ? id : null;
}

export async function connectionOptions(nonce?: string) {
  const c = await get(nonce);
  await c.whenManifestLoaded;
  return c.availableWallets.map(({ manifest: { id, name } }) => ({ id, name }));
}

export async function connect(nonce: string | undefined, walletId: string): Promise<void> {
  const c = await get(nonce);
  const w = await c.connect({ walletId });
  const id = testnetAccount((await w.getAccounts())[0]?.accountId);
  if (!id) {
    await c.disconnect().catch(() => {});
    set(null);
    throw new Error("Select a NEAR testnet account in your wallet, then reconnect.");
  }
  set(id);
}

export async function disconnect(): Promise<void> {
  await (await get()).disconnect();
  set(null);
}

/** Sign and send one transaction with the connected wallet; resolves with the final outcome. */
export async function send(tx: Tx): Promise<unknown> {
  const w = await (await get()).wallet();
  return w.signAndSendTransaction(tx as never);
}
