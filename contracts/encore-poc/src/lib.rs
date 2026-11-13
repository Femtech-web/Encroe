//! Encore go/no-go contract.
//!
//! E1: the recovery key for `(this account, path)` exists only in the NEAR MPC network. This
//! contract asks for it, as a public release (identity `AppPublicKeyPV`), only after the
//! publisher's heartbeat has lapsed for `grace_ns`. Anyone may trigger that release.
//!
//! E2: `verify` asks OutLayer to run the pinned verifier build on a committed sealed epoch,
//! with the publisher's secret row; the guest's JSON comes back through yield/resume.

use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::{env, log, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use sha2::{Digest, Sha256};

const MPC_CALL_GAS: Gas = Gas::from_tgas(30);
const MPC_CALLBACK_GAS: Gas = Gas::from_tgas(10);
const OUTLAYER_CALL_GAS: Gas = Gas::from_tgas(200);
const OUTLAYER_CALLBACK_GAS: Gas = Gas::from_tgas(25);

/// Compressed BLS12-381 identities (infinity flag set).
const G1_IDENTITY_B58: &str = "bls12381g1:83VnBdpeT9ioHuUTBD2zcitXg7JqNiebUs5yxDaYaLgZYDLLk2gayHrJKNyRt4vBQB";
/// Compressed G1 generator, for the `a = 1` fallback (`sig = big_c - big_y`).
const G1_GENERATOR_B58: &str = "bls12381g1:6aGxBiDyBZxEL9RKJz8W2h7VQUUKv9BPqHbC2DNWKExVRM7GWtLk6mTQBYXbpgRHwp";
const G2_IDENTITY_B58: &str =
    "bls12381g2:2995BcogDeU9PQxbssLWhG9J76ubezYVpjbceWnwcmRs9ypA2vYDikf8mpuzankQX6WMsDockieKarmDerS2xTPzR1dktiHiGkjvPpRYpDip6unu4WgtPqeCPtxqppMzuGwy";

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct CkdResponse {
    pub big_y: String,
    pub big_c: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Commitment {
    pub game: String,
    pub epoch: u64,
    pub ckd_pk: String,
    pub app_id: String,
    pub sealed_u: String,
    pub sealed_v: String,
    pub pkg_sha256: String,
    pub root: String,
    pub core_sha256: String,
    pub players: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Run {
    pub kind: String,
    pub wasm_hash: String,
    pub requester: AccountId,
    pub block_height: u64,
    pub seed: String,
    pub output: Option<String>,
    pub accepted: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EncorePoc {
    owner: AccountId,
    mpc: AccountId,
    domain_id: u64,
    /// "pv_identity" (public by construction) or "plain_generator" (a = 1 fallback).
    key_mode: String,
    path: String,
    grace_ns: u64,
    last_heartbeat_ns: u64,
    eol_at_ns: Option<u64>,
    release_pending: bool,
    released: Option<CkdResponse>,
    released_by: Option<AccountId>,
    outlayer: AccountId,
    verifier_url: String,
    verifier_hash: String,
    secret_profile: String,
    commitment: Option<Commitment>,
    runs: Vec<Run>,
}

#[near]
impl EncorePoc {
    #[init]
    pub fn new(
        owner: AccountId,
        mpc: AccountId,
        domain_id: u64,
        key_mode: String,
        path: String,
        grace_ns: u64,
        outlayer: AccountId,
        verifier_url: String,
        verifier_hash: String,
        secret_profile: String,
    ) -> Self {
        require!(verifier_hash.len() == 64, "verifier_hash must be 64 hex chars");
        require!(key_mode == "pv_identity" || key_mode == "plain_generator", "unknown key_mode");
        Self {
            owner,
            mpc,
            domain_id,
            key_mode,
            path,
            grace_ns,
            last_heartbeat_ns: env::block_timestamp(),
            eol_at_ns: None,
            release_pending: false,
            released: None,
            released_by: None,
            outlayer,
            verifier_url,
            verifier_hash,
            secret_profile,
            commitment: None,
            runs: Vec::new(),
        }
    }

    // ---------- publisher ----------

    pub fn heartbeat(&mut self) {
        self.assert_owner();
        require!(self.released.is_none() && !self.release_pending, "already released");
        self.last_heartbeat_ns = env::block_timestamp();
    }

    /// The publisher ends service: release becomes possible `notice_ns` from now.
    pub fn declare_end_of_life(&mut self, notice_ns: u64) {
        self.assert_owner();
        require!(self.released.is_none() && !self.release_pending, "already released");
        self.eol_at_ns = Some(env::block_timestamp().saturating_add(notice_ns));
    }

    pub fn commit(&mut self, commitment: Commitment) {
        self.assert_owner();
        require!(self.released.is_none() && !self.release_pending, "already released");
        for h in [&commitment.app_id, &commitment.pkg_sha256, &commitment.root, &commitment.core_sha256, &commitment.sealed_v] {
            require!(h.len() == 64, "hashes are 32-byte hex");
        }
        require!(commitment.sealed_u.len() == 192, "sealed_u is a 96-byte hex G2 point");
        self.commitment = Some(commitment);
    }

    // ---------- E1: release ----------

    pub fn release_condition_met(&self) -> bool {
        let now = env::block_timestamp();
        now > self.last_heartbeat_ns.saturating_add(self.grace_ns) || self.eol_at_ns.is_some_and(|t| now >= t)
    }

    /// Anyone may call; only succeeds once the heartbeat has lapsed.
    pub fn release(&mut self) -> Promise {
        require!(self.released.is_none(), "already released");
        require!(!self.release_pending, "release in flight");
        require!(self.release_condition_met(), "release condition not met: publisher heartbeat is live and no end of life is due");
        self.release_pending = true;
        let app_public_key = if self.key_mode == "pv_identity" {
            json!({"AppPublicKeyPV": {"pk1": G1_IDENTITY_B58, "pk2": G2_IDENTITY_B58}})
        } else {
            json!({"AppPublicKey": G1_GENERATOR_B58})
        };
        let args = json!({
            "request": {
                "derivation_path": self.path,
                "app_public_key": app_public_key,
                "domain_id": self.domain_id,
            }
        });
        Promise::new(self.mpc.clone())
            .function_call(
                "request_app_private_key".to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                MPC_CALL_GAS,
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(MPC_CALLBACK_GAS).on_released(env::predecessor_account_id()))
    }

    #[private]
    pub fn on_released(&mut self, caller: AccountId, #[callback_result] result: Result<CkdResponse, PromiseError>) -> bool {
        self.release_pending = false;
        match result {
            Ok(resp) => {
                log!("released by {}: big_c={}", caller, resp.big_c);
                self.released = Some(resp);
                self.released_by = Some(caller);
                true
            }
            Err(_) => false,
        }
    }

    // ---------- E2: OutLayer verification ----------

    /// Runs the pinned verifier on the committed epoch. `package_b64` must hash to the commitment.
    #[payable]
    pub fn verify(&mut self, package_b64: Base64VecU8) -> Promise {
        let url = self.verifier_url.clone();
        let hash = self.verifier_hash.clone();
        self.request_run("verify", url, hash, package_b64)
    }

    /// TEST ONLY (owner): the same secret reference with another build, to show the keystore refuses it.
    #[payable]
    pub fn probe(&mut self, wasm_url: String, wasm_hash: String, package_b64: Base64VecU8) -> Promise {
        self.assert_owner();
        self.request_run("probe", wasm_url, wasm_hash, package_b64)
    }

    #[private]
    pub fn on_run(&mut self, index: u32, #[callback_result] result: Result<Option<Value>, PromiseError>) -> bool {
        let output = match result {
            Ok(Some(v)) if !v.is_null() => Some(v),
            _ => None,
        };
        let accepted = match (&output, &self.commitment) {
            (Some(v), Some(c)) => {
                self.runs[index as usize].kind == "verify"
                    && v["pass"] == Value::Bool(true)
                    && v["pkg_sha256"].as_str() == Some(&c.pkg_sha256)
                    && v["root"].as_str() == Some(&c.root)
                    && v["core_sha256"].as_str() == Some(&c.core_sha256)
                    && v["seed"].as_str() == Some(&self.runs[index as usize].seed)
                    && v["mode"].as_str() == Some("secret")
            }
            _ => false,
        };
        let run = &mut self.runs[index as usize];
        run.output = output.map(|v| v.to_string());
        run.accepted = accepted;
        accepted
    }

    // ---------- views ----------

    pub fn get_state(&self) -> Value {
        json!({
            "owner": self.owner,
            "mpc": self.mpc,
            "domain_id": self.domain_id,
            "key_mode": self.key_mode,
            "path": self.path,
            "grace_ns": self.grace_ns.to_string(),
            "last_heartbeat_ns": self.last_heartbeat_ns.to_string(),
            "eol_at_ns": self.eol_at_ns.map(|t| t.to_string()),
            "now_ns": env::block_timestamp().to_string(),
            "release_condition_met": self.release_condition_met(),
            "release_pending": self.release_pending,
            "released": self.released,
            "released_by": self.released_by,
            "outlayer": self.outlayer,
            "verifier_url": self.verifier_url,
            "verifier_hash": self.verifier_hash,
            "secret_profile": self.secret_profile,
            "commitment": self.commitment,
        })
    }

    pub fn get_runs(&self) -> Vec<Run> {
        self.runs.clone()
    }

    // ---------- internal ----------

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
    }

    fn request_run(&mut self, kind: &str, wasm_url: String, wasm_hash: String, package_b64: Base64VecU8) -> Promise {
        require!(self.released.is_none(), "already released");
        let c = self.commitment.clone().unwrap_or_else(|| env::panic_str("no commitment"));
        let got = hex::encode(Sha256::digest(&package_b64.0));
        require!(got == c.pkg_sha256, "package does not match the committed pkg_sha256");
        let seed = hex::encode(env::random_seed_array());
        let input = json!({
            "v": 1,
            "game": c.game,
            "epoch": c.epoch,
            "predecessor": env::current_account_id(),
            "path": self.path,
            "domain_id": self.domain_id,
            "ckd_pk": c.ckd_pk,
            "app_id": c.app_id,
            "sealed_u": c.sealed_u,
            "sealed_v": c.sealed_v,
            "pkg_b64": package_b64,
            "pkg_sha256": c.pkg_sha256,
            "root": c.root,
            "core_sha256": c.core_sha256,
            "seed": seed,
        });
        let args = json!({
            "source": {"WasmUrl": {"url": wasm_url, "hash": wasm_hash, "build_target": "wasm32-wasip2"}},
            "resource_limits": {"max_instructions": 100_000_000_000u64, "max_memory_mb": 1024, "max_execution_seconds": 120},
            "input_data": input.to_string(),
            "secrets_ref": {"profile": self.secret_profile, "account_id": self.owner},
            "response_format": "Json",
        });
        let index = self.runs.len() as u32;
        self.runs.push(Run {
            kind: kind.to_string(),
            wasm_hash,
            requester: env::predecessor_account_id(),
            block_height: env::block_height(),
            seed,
            output: None,
            accepted: false,
        });
        Promise::new(self.outlayer.clone())
            .function_call("request_execution".to_string(), serde_json::to_vec(&args).unwrap(), env::attached_deposit(), OUTLAYER_CALL_GAS)
            .then(Self::ext(env::current_account_id()).with_static_gas(OUTLAYER_CALLBACK_GAS).on_run(index))
    }
}
