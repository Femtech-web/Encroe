import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { merklePath, playerLeaf } from "../game/proof";
import type { PackagePlayer } from "./release";

/**
 * Taking a released world's items to another chain (contracts/encroe-items, contracts/evm/src/EncroeItems.sol): the
 * player signs a claim with their game key; encroe-items checks it against the escrow's committed root and has NEAR's
 * MPC network sign it; EncroeItems on Base Sepolia mints exactly that, once.
 */
export const ITEMS_CONTRACT = "encroe-items-ba9e16.testnet";
export const ITEMS_TOKEN = "0x94365D73B3C539680622E681aEAcefeC01c8a2e1";
export const ITEMS_SIGNER = "0x30e6f17b3fBCbD12aF69bBebD2D0c25EfE8AbbCd";
export const ITEMS_CHAIN = {
  id: 84532,
  name: "Base Sepolia",
  rpc: "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
};

/** Only escrows the factory made can be claimed from: nobody else can create a `*.encroe.testnet` account. */
export const claimable = (escrow: string) => escrow.endsWith(".encroe.testnet");

export const isEvmAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

/** What the player's game key signs: the escrow and the address their items go to. */
export const claimMessage = (escrow: string, to: string) => `encroe-claim-v1|${escrow}|${to.toLowerCase()}`;

export type ClaimArgs = {
  escrow: string;
  player: string;
  items: [number, number][];
  salt: string;
  path: [string, boolean][];
  to: string;
  signature: string;
};

/** The claim for the player whose key is `sk`, from the opened package; null when that key is not in the world. */
export function claimFor(
  escrow: string,
  game: string,
  epoch: number,
  players: PackagePlayer[],
  pk: string,
  sk: Uint8Array,
  to: string,
): ClaimArgs | null {
  const index = players.findIndex((p) => p.pk === pk);
  if (index < 0) return null;
  const me = players[index];
  const leaves = players.map((p) => playerLeaf(game, epoch, p.pk, p.items, p.salt));
  return {
    escrow,
    player: pk,
    items: me.items,
    salt: me.salt,
    path: merklePath(leaves, index),
    to: to.toLowerCase(),
    signature: bytesToHex(ed25519.sign(utf8ToBytes(claimMessage(escrow, to)), sk)),
  };
}

export type SignedClaim = {
  claim: { escrow: string; epoch: number; player: string; to: string; ids: number[]; amounts: number[] };
  digest: string;
  v: number;
  r: string;
  s: string;
};

/** The command that relays a signed claim to EncroeItems with any funded Base Sepolia account. */
export function relayCommand(c: SignedClaim): string {
  const { claim } = c;
  return [
    `cast send ${ITEMS_TOKEN} \\`,
    `  "claim(string,uint64,bytes32,address,uint32[],uint32[],uint8,bytes32,bytes32)" \\`,
    `  ${claim.escrow} ${claim.epoch} 0x${claim.player} ${claim.to} "[${claim.ids}]" "[${claim.amounts}]" \\`,
    `  ${c.v} ${c.r} ${c.s} --rpc-url ${ITEMS_CHAIN.rpc} --account <yours>`,
  ].join("\n");
}
