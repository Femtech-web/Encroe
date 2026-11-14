//! Encroe's handover: once a game's escrow is released, each player may take what they earned to another chain.
//!
//! A player sends their sealed items, their salt and Merkle path, an EVM address, and a signature by their game key.
//! This contract reads the escrow's own state on NEAR, checks the escrow is released, that it was made by the factory
//! (a `*.encroe.testnet` account, which only the locked factory can create), that the player's leaf is under the
//! committed root, and that the player signed for that address. Then NEAR's MPC network signs an EIP-712 claim with
//! the key it derives for this contract, and `EncroeItems` on the other chain mints exactly those items, once.
//! Nobody holds that key; anyone may relay the signature.

use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};

const GET_STATE_GAS: Gas = Gas::from_tgas(10);
const ON_STATE_GAS: Gas = Gas::from_tgas(80);
const MPC_GAS: Gas = Gas::from_tgas(30);
const ON_SIGNED_GAS: Gas = Gas::from_tgas(15);
const FACTORY_SUFFIX: &str = ".encroe.testnet";
const PENDING: &str = "pending";

/// One player's claim, as the MPC network signs it and the token contract checks it.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Claim {
    pub escrow: AccountId,
    pub epoch: u64,
    pub player: String,
    pub to: String,
    pub ids: Vec<u32>,
    pub amounts: Vec<u32>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EncroeItems {
    mpc: AccountId,
    path: String,
    domain_id: u64,
    chain_id: u64,
    /// The `EncroeItems` token contract on the other chain (20 bytes).
    token: [u8; 20],
    /// `<escrow>/<player key>`: "pending" while the MPC network signs, then the signed claim.
    claims: LookupMap<String, String>,
}

#[near]
impl EncroeItems {
    #[init]
    pub fn new(mpc: AccountId, path: String, domain_id: u64, chain_id: u64, token: String) -> Self {
        Self { mpc, path, domain_id, chain_id, token: hex20(&token), claims: LookupMap::new(b"c") }
    }

    /// Claim a released world's items for `to` on the other chain. `signature` is the player's ed25519 signature,
    /// by the key the game knew them by, over `encroe-claim-v1|<escrow>|<to>`.
    pub fn claim(
        &mut self,
        escrow: AccountId,
        player: String,
        items: Vec<(u32, u32)>,
        salt: String,
        path: Vec<(String, bool)>,
        to: String,
        signature: String,
    ) -> Promise {
        require!(escrow.as_str().ends_with(FACTORY_SUFFIX), "only escrows made by the Encroe factory");
        let pk = hex32(&player);
        hex32(&salt);
        hex20(&to);
        require!(!items.is_empty() && items.len() <= 16 && items.iter().all(|(_, q)| *q > 0), "1 to 16 kinds of item");
        require!(path.len() <= 8, "path too long");
        let sig: [u8; 64] = hex::decode(&signature).ok().and_then(|b| b.try_into().ok()).unwrap_or_else(|| env::panic_str("bad signature"));
        let message = format!("encroe-claim-v1|{escrow}|{}", to.to_lowercase());
        require!(env::ed25519_verify(&sig, message.as_bytes(), &pk), "the player's key did not sign this claim");
        let key = format!("{escrow}/{player}");
        require!(!self.claims.contains_key(&key), "already claimed");
        self.claims.insert(key, PENDING.into());
        Promise::new(escrow.clone())
            .function_call("get_state", b"{}".to_vec(), NearToken::from_yoctonear(0), GET_STATE_GAS)
            .then(Self::ext(env::current_account_id()).with_static_gas(ON_STATE_GAS).on_state(escrow, player, items, salt, path, to))
    }

    #[private]
    pub fn on_state(
        &mut self,
        escrow: AccountId,
        player: String,
        items: Vec<(u32, u32)>,
        salt: String,
        path: Vec<(String, bool)>,
        to: String,
        #[callback_result] state: Result<Value, PromiseError>,
    ) -> PromiseOrValue<bool> {
        let key = format!("{escrow}/{player}");
        let refuse = |me: &mut Self, why: &str| {
            log!("claim refused: {}", why);
            me.claims.remove(&key);
            PromiseOrValue::Value(false)
        };
        let Ok(state) = state else { return refuse(self, "the escrow did not answer") };
        if state["released"].is_null() {
            return refuse(self, "the escrow is not released");
        }
        let c = &state["commitment"];
        let (Some(game), Some(epoch), Some(root)) = (c["game"].as_str(), c["epoch"].as_u64(), c["root"].as_str()) else {
            return refuse(self, "the escrow has no commitment");
        };
        let leaf = player_leaf(game, epoch, &hex32(&player), &items, &hex32(&salt));
        if hex::encode(root_from_path(leaf, &path)) != root {
            return refuse(self, "these items are not in the sealed world");
        }
        let mut sorted = items;
        sorted.sort_by_key(|(id, _)| *id);
        let claim = Claim {
            escrow,
            epoch,
            player,
            to: to.to_lowercase(),
            ids: sorted.iter().map(|(id, _)| *id).collect(),
            amounts: sorted.iter().map(|(_, q)| *q).collect(),
        };
        let digest = self.digest(&claim);
        PromiseOrValue::Promise(
            Promise::new(self.mpc.clone())
                .function_call(
                    "sign",
                    json!({ "request": { "path": self.path, "payload_v2": { "Ecdsa": hex::encode(digest) }, "domain_id": self.domain_id } })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(1),
                    MPC_GAS,
                )
                .then(Self::ext(env::current_account_id()).with_static_gas(ON_SIGNED_GAS).on_signed(claim, hex::encode(digest))),
        )
    }

    #[private]
    pub fn on_signed(&mut self, claim: Claim, digest: String, #[callback_result] result: Result<Value, PromiseError>) -> bool {
        let key = format!("{}/{}", claim.escrow, claim.player);
        let signed = result.ok().and_then(|r| {
            let r_hex = r["big_r"]["affine_point"].as_str()?.to_string();
            let s_hex = r["s"]["scalar"].as_str()?.to_string();
            let rec = r["recovery_id"].as_u64()?;
            (r_hex.len() == 66 && s_hex.len() == 64 && rec <= 1).then(|| (27 + rec, r_hex[2..].to_string(), s_hex))
        });
        let Some((v, r, s)) = signed else {
            log!("the MPC network did not sign {}", key);
            self.claims.remove(&key);
            return false;
        };
        let record = json!({ "claim": claim, "digest": format!("0x{digest}"), "v": v, "r": format!("0x{r}"), "s": format!("0x{s}") });
        log!("signed {}", key);
        self.claims.insert(key, record.to_string());
        true
    }

    // ---------- views ----------

    /// The signed claim (relay it to `EncroeItems.claim`), "pending" while signing, or null.
    pub fn get_claim(&self, escrow: AccountId, player: String) -> Option<Value> {
        self.claims.get(&format!("{escrow}/{player}")).map(|s| if s == PENDING { json!(PENDING) } else { near_sdk::serde_json::from_str(s).unwrap() })
    }

    pub fn config(&self) -> Value {
        json!({ "mpc": self.mpc, "path": self.path, "domain_id": self.domain_id, "chain_id": self.chain_id, "token": format!("0x{}", hex::encode(self.token)) })
    }

    /// The EIP-712 digest the token contract recovers the MPC signer from.
    pub fn claim_digest(&self, claim: Claim) -> String {
        format!("0x{}", hex::encode(self.digest(&claim)))
    }
}

impl EncroeItems {
    fn digest(&self, c: &Claim) -> [u8; 32] {
        let domain = env::keccak256_array(
            &[
                env::keccak256_array(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                env::keccak256_array(b"Encroe Items"),
                env::keccak256_array(b"1"),
                word_u64(self.chain_id),
                word_address(&self.token),
            ]
            .concat(),
        );
        let items: Vec<u8> = c.ids.iter().chain(c.amounts.iter()).flat_map(|n| word_u64(*n as u64)).collect();
        let strukt = env::keccak256_array(
            &[
                env::keccak256_array(b"Claim(bytes32 escrow,uint64 epoch,bytes32 player,address to,bytes32 items)"),
                env::keccak256_array(c.escrow.as_bytes()),
                word_u64(c.epoch),
                hex32(&c.player),
                word_address(&hex20(&c.to)),
                env::keccak256_array(&items),
            ]
            .concat(),
        );
        env::keccak256_array(&[&[0x19, 0x01][..], &domain, &strukt].concat())
    }
}

fn word_u64(n: u64) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[24..].copy_from_slice(&n.to_be_bytes());
    w
}

fn word_address(a: &[u8; 20]) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(a);
    w
}

fn hex32(s: &str) -> [u8; 32] {
    hex::decode(s.trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()).unwrap_or_else(|| env::panic_str("expected 32 bytes of hex"))
}

fn hex20(s: &str) -> [u8; 20] {
    hex::decode(s.trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()).unwrap_or_else(|| env::panic_str("expected a 20-byte address"))
}

/// The sealed state's bytes: `n:u32 || (id:u32, qty:u32)*`, ids ascending, little-endian (encore-crypto game.rs).
fn state_bytes(items: &[(u32, u32)]) -> Vec<u8> {
    let mut sorted = items.to_vec();
    sorted.sort_by_key(|(id, _)| *id);
    let mut out = (sorted.len() as u32).to_le_bytes().to_vec();
    for (id, q) in sorted {
        out.extend_from_slice(&id.to_le_bytes());
        out.extend_from_slice(&q.to_le_bytes());
    }
    out
}

/// sha256(0x00 || "encore-leaf-v1" || u32(len game) || game || u64(epoch) || pk || sha256(state) || salt).
fn player_leaf(game: &str, epoch: u64, pk: &[u8; 32], items: &[(u32, u32)], salt: &[u8; 32]) -> [u8; 32] {
    let state = env::sha256_array(&state_bytes(items));
    env::sha256_array(
        &[
            &[0u8][..],
            b"encore-leaf-v1",
            &(game.len() as u32).to_le_bytes(),
            game.as_bytes(),
            &epoch.to_le_bytes(),
            pk,
            &state,
            salt,
        ]
        .concat(),
    )
}

/// Each step: `(sibling, sibling_is_right)`; a node is sha256(0x01 || left || right).
fn root_from_path(leaf: [u8; 32], path: &[(String, bool)]) -> [u8; 32] {
    path.iter().fold(leaf, |acc, (sib, right)| {
        let s = hex32(sib);
        let (l, r) = if *right { (acc, s) } else { (s, acc) };
        env::sha256_array(&[&[1u8][..], &l, &r].concat())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaf_and_root_match_the_sealer() {
        // web/lib/game/proof.ts and encore-crypto build the same leaf; one player's path is empty at one leaf.
        let leaf = player_leaf("embergate", 3, &[7; 32], &[(9, 1), (1, 4)], &[5; 32]);
        assert_eq!(root_from_path(leaf, &[]), leaf);
        let sib = hex::encode([2u8; 32]);
        let up = root_from_path(leaf, &[(sib.clone(), true)]);
        assert_eq!(up, env::sha256_array(&[&[1u8][..], &leaf, &[2u8; 32]].concat()));
        assert_ne!(up, root_from_path(leaf, &[(sib, false)]));
    }

    #[test]
    fn leaf_and_root_are_the_sites() {
        // The same inputs through web/lib/game/proof.ts `playerLeaf` and `rootFromPath`.
        let leaf = player_leaf("embergate", 3, &[7; 32], &[(9, 1), (1, 4)], &[5; 32]);
        assert_eq!(hex::encode(leaf), "545972016e85d6881c4e61ee8ac909ef12e182a37c1b02a2ab71b66c118e0393");
        let path = [(hex::encode([2u8; 32]), true), (hex::encode([0x0au8; 32]), false)];
        assert_eq!(hex::encode(root_from_path(leaf, &path)), "e90b572580bd0090684437c6af07281f357b6f45277aa9b660d8df0b11e0c368");
    }

    /// The claim EncroeItems.t.sol checks: the token recovers the signer from exactly this digest.
    pub fn fixed_claim() -> (EncroeItems, Claim) {
        let c = EncroeItems::new("v1.signer-prod.testnet".parse().unwrap(), "encroe/items/1".into(), 0, 84532, "0x00000000000000000000000000000000000000aa".into());
        let claim = Claim {
            escrow: "orchard.encroe.testnet".parse().unwrap(),
            epoch: 1,
            player: hex::encode([7u8; 32]),
            to: "0x00000000000000000000000000000000000000bb".into(),
            ids: vec![1, 3],
            amounts: vec![120, 48],
        };
        (c, claim)
    }

    #[test]
    fn claim_digest_is_eip712() {
        let (c, claim) = fixed_claim();
        assert_eq!(c.claim_digest(claim), "0x5ef45b10eebc51b18e5c7667433e71aebf3fcc376fc873267891a4acf9dce870");
    }

    #[test]
    fn state_bytes_sort_items() {
        assert_eq!(state_bytes(&[(9, 1), (1, 4)]), [2, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 9, 0, 0, 0, 1, 0, 0, 0]);
    }
}
