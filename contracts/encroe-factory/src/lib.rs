//! Encroe's factory and directory. Any studio creates its game's escrow here: a subaccount created with **no
//! access key at all** (keyless from its first block, not locked afterwards), running the one escrow build
//! compiled into this factory, initialised with the factory's fixed verifier, MPC network and DCAP verifier. The
//! studio chooses only its name, its owner account and its grace period, and pays the escrow's storage. Every
//! escrow made here is listed, so anyone can find a game's escrow and check where it came from.

use near_sdk::serde_json::json;
use near_sdk::store::Vector;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

/// The escrow build every studio gets: `contracts/encroe-escrow`, built by cargo-near before this crate.
const ESCROW_WASM: &[u8] = include_bytes!("../../encroe-escrow/target/near/encroe_escrow.wasm");

/// Storage for the escrow's code and state (the approved-images list included), with room for its runs.
pub const MIN_DEPOSIT: NearToken = NearToken::from_near(5);
pub const MIN_GRACE_S: u64 = 60;
pub const MAX_GRACE_S: u64 = 365 * 24 * 3600;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub escrow: AccountId,
    pub owner: AccountId,
    pub game: String,
    pub grace_s: u64,
    pub created_ns: u64,
    pub created_by: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    listings: Vector<Listing>,
    mpc: AccountId,
    outlayer: AccountId,
    verifier_url: String,
    verifier_hash: String,
    dcap_verifier: AccountId,
    registry: AccountId,
}

/// 2 to 32 lowercase letters, digits and inner hyphens: the escrow becomes `<name>.<factory>`.
fn valid_name(name: &str) -> bool {
    let b = name.as_bytes();
    (2..=32).contains(&b.len())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        && b[0] != b'-'
        && b[b.len() - 1] != b'-'
}

#[near]
impl Factory {
    #[init]
    pub fn new(
        mpc: AccountId,
        outlayer: AccountId,
        verifier_url: String,
        verifier_hash: String,
        dcap_verifier: AccountId,
        registry: AccountId,
    ) -> Self {
        require!(verifier_hash.len() == 64, "verifier_hash must be 64 hex chars");
        Self { listings: Vector::new(b"l"), mpc, outlayer, verifier_url, verifier_hash, dcap_verifier, registry }
    }

    /// Creates `<name>.<factory>`: no access key, the escrow code deployed, initialised for `owner`. The attached
    /// deposit (at least 5 NEAR) becomes the escrow's balance; if anything fails, it goes back to the caller.
    #[payable]
    pub fn create_escrow(&mut self, name: String, owner: AccountId, game: String, grace_s: u64) -> Promise {
        require!(valid_name(&name), "name: 2 to 32 lowercase letters, digits or inner hyphens");
        require!(!game.is_empty() && game.len() <= 64, "game: 1 to 64 characters");
        require!((MIN_GRACE_S..=MAX_GRACE_S).contains(&grace_s), "grace_s: 60 seconds to 365 days");
        let deposit = env::attached_deposit();
        require!(deposit >= MIN_DEPOSIT, "attach at least 5 NEAR: the escrow's storage");

        let escrow: AccountId = format!("{name}.{}", env::current_account_id()).parse().unwrap();
        let args = json!({
            "owner": owner,
            "mpc": self.mpc,
            "domain_id": 2,
            "key_mode": "pv_identity",
            "path": format!("encroe/{name}/1"),
            "grace_ns": grace_s * 1_000_000_000,
            "outlayer": self.outlayer,
            "verifier_url": self.verifier_url,
            "verifier_hash": self.verifier_hash,
            "secret_profile": format!("encroe-{name}"),
            "dcap_verifier": self.dcap_verifier,
            "registry": self.registry,
        });
        let listing = Listing {
            escrow: escrow.clone(),
            owner,
            game,
            grace_s,
            created_ns: env::block_timestamp(),
            created_by: env::predecessor_account_id(),
        };
        // No add_full_access_key: the account never has a key.
        Promise::new(escrow)
            .create_account()
            .transfer(deposit)
            .deploy_contract(ESCROW_WASM.to_vec())
            .function_call("new".to_string(), args.to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(30))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(15)).on_created(listing, deposit))
    }

    /// Lists the escrow once it exists; otherwise returns the deposit to whoever paid it.
    #[private]
    pub fn on_created(
        &mut self,
        listing: Listing,
        deposit: NearToken,
        #[callback_result] created: Result<(), PromiseError>,
    ) -> bool {
        if created.is_ok() {
            self.listings.push(listing);
            true
        } else {
            let _ = Promise::new(listing.created_by).transfer(deposit);
            false
        }
    }

    pub fn count(&self) -> u32 {
        self.listings.len()
    }

    /// The directory, oldest first.
    pub fn list(&self, from: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        let from = from.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        (from..self.listings.len().min(from.saturating_add(limit))).filter_map(|i| self.listings.get(i).cloned()).collect()
    }

    /// What every escrow made here runs: compare with the code hash of any escrow account it lists.
    pub fn escrow_code_sha256(&self) -> String {
        hex::encode(env::sha256(ESCROW_WASM))
    }

    pub fn config(&self) -> near_sdk::serde_json::Value {
        json!({
            "mpc": self.mpc,
            "outlayer": self.outlayer,
            "verifier_url": self.verifier_url,
            "verifier_hash": self.verifier_hash,
            "dcap_verifier": self.dcap_verifier,
            "registry": self.registry,
            "min_deposit_near": 5,
            "grace_s": [MIN_GRACE_S, MAX_GRACE_S],
        })
    }
}
