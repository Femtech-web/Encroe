import { rpcCall, viewCall } from "../game/near";
import { storeArgs } from "./outlayer";

/**
 * The on-chain side of sealing from the browser, as scripts/testnet/escrow.sh does it: which epoch comes next, what
 * OutLayer charges for the key row and for one verification run, and the run's OutLayer request id.
 */

export const MPC = "v1.signer-prod.testnet";
export const OUTLAYER = "outlayer.testnet";
const LIMITS = { max_instructions: 100_000_000_000, max_memory_mb: 1024, max_execution_seconds: 120 };

export const nextEpoch = (commitment: { epoch: number } | null) => (commitment ? commitment.epoch + 1 : 1);

/** OutLayer's storage price for the key row, with the script's 20% margin (the surplus is refunded). */
export async function storeDeposit(
  args: ReturnType<typeof storeArgs>,
  owner: string,
  view = viewCall,
): Promise<bigint> {
  const yocto = await view<string>(OUTLAYER, "estimate_storage_cost", { ...args, owner });
  return (BigInt(yocto) * 12n) / 10n;
}

/** OutLayer's price for one run: the input carries the whole package, so it is sized from it; the unused part is refunded. */
export async function verifyDeposit(packageB64Length: number, view = viewCall): Promise<bigint> {
  const yocto = await view<string>(OUTLAYER, "estimate_execution_cost", {
    resource_limits: LIMITS,
    input_len: packageB64Length * 2 + 4096,
  });
  return BigInt(yocto) * 2n;
}

const REQUEST = /request_id[\\"]*:\s*(\d+)/;

/** OutLayer's request id, from its `execution_requested` event in a transaction's outcome. */
export function requestIdOf(outcome: unknown): number | null {
  const m = JSON.stringify(outcome ?? null).match(REQUEST);
  return m ? Number(m[1]) : null;
}

/** The same, from the chain, for a wallet that returned only the hash (once the run is done, so is the transaction). */
export async function requestIdFromTx(hash: string, sender: string): Promise<number | null> {
  const body = await rpcCall("tx", { tx_hash: hash, sender_account_id: sender, wait_until: "EXECUTED_OPTIMISTIC" });
  return requestIdOf(body.result);
}

export const near = (yocto: bigint) => `${(Number(yocto / 10n ** 18n) / 1e6).toFixed(4)} NEAR`;
