/** OutLayer, the TDX enclave that runs the pinned verifier, and the shape of an escrow's key row in its keystore. */

export const OUTLAYER_API = process.env.OUTLAYER_API ?? "https://testnet-api.outlayer.ai";
export const VERIFIER_HASH = "9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad";

/** `store_secrets` arguments: readable only by the pinned verifier's build, and only when called by this escrow. */
export function storeArgs(profile: string, escrow: string, blobB64: string) {
  return {
    accessor: { WasmHash: { hash: VERIFIER_HASH } },
    profile,
    encrypted_secrets_base64: blobB64,
    access: {
      Logic: {
        operator: "And",
        conditions: [
          { WasmHash: { hash: VERIFIER_HASH } },
          { Predecessor: { condition: { Whitelist: { accounts: [escrow] } } } },
        ],
      },
    },
    vault_id: null,
  };
}
