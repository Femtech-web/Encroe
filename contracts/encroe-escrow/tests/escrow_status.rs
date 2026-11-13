//! The escrow's lifecycle and badge, driven through the contract's own callbacks: a broken build turns the
//! badge red, a new epoch starts unverified, a passing run waits for its proof, and only a quote NEAR's DCAP
//! verifier accepted (OutLayer request 25728's real bytes) turns it green. Release waits for the heartbeat
//! to lapse; after it, nothing can be re-sealed.

use encroe_escrow::{Commitment, EncroeEscrow};
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{json, Value};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};
use sha2::{Digest, Sha256};

const GRACE_NS: u64 = 300_000_000_000;
const PACKAGE: &[u8] = b"a sealed package";

fn me() -> AccountId {
    "escrow.testnet".parse().unwrap()
}

fn ctx(predecessor: AccountId, now_ns: u64) -> VMContextBuilder {
    let mut c = VMContextBuilder::new();
    c.current_account_id(me()).predecessor_account_id(predecessor).block_timestamp(now_ns).attached_deposit(NearToken::from_near(1));
    c
}

fn at(predecessor: AccountId, now_ns: u64, results: Vec<PromiseResult>) {
    testing_env!(ctx(predecessor, now_ns).build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
}

fn escrow() -> EncroeEscrow {
    at(accounts(0), 1, vec![]);
    EncroeEscrow::new(
        accounts(0),
        "v1.signer-prod.testnet".parse().unwrap(),
        2,
        "pv_identity".into(),
        "encroe/g1/1".into(),
        GRACE_NS,
        "outlayer.testnet".parse().unwrap(),
        "https://example.test/verifier.wasm".into(),
        "9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad".into(),
        "encroe-g1".into(),
        "tee-verifier-2026-07-22.testnet".parse().unwrap(),
        "worker.outlayer.testnet".parse().unwrap(),
    )
}

fn pkg_sha() -> String {
    hex::encode(Sha256::digest(PACKAGE))
}

fn commitment(epoch: u64) -> Commitment {
    Commitment {
        game: "g1".into(),
        epoch,
        ckd_pk: "bls12381g2:pk".into(),
        app_id: "11".repeat(32),
        sealed_u: "22".repeat(96),
        sealed_v: "33".repeat(32),
        pkg_sha256: pkg_sha(),
        root: "44".repeat(32),
        core_sha256: "55".repeat(32),
        players: 8,
    }
}

fn status(e: &EncroeEscrow) -> Value {
    e.status()
}

/// A stranger asks for a verification run; the enclave's answer comes back through `on_run`.
fn run(e: &mut EncroeEscrow, now: u64, output: Value) -> u32 {
    at(accounts(2), now, vec![]);
    let _ = e.verify(Base64VecU8(PACKAGE.to_vec()));
    let index = e.get_runs().len() as u32 - 1;
    let seed = e.get_runs()[index as usize].seed.clone();
    let mut out = output;
    out["seed"] = json!(seed);
    at(me(), now, vec![PromiseResult::Successful(out.to_string().into_bytes())]);
    e.on_run(index, Ok(Some(out)));
    index
}

fn passing(c: &Commitment) -> Value {
    json!({"pass": true, "pkg_sha256": c.pkg_sha256, "root": c.root, "core_sha256": c.core_sha256, "mode": "secret"})
}

#[test]
fn badge_follows_the_current_epoch() {
    let mut e = escrow();
    assert_eq!(status(&e)["badge"], "unsealed");
    assert_eq!(status(&e)["phase"], "live");

    at(accounts(0), 10, vec![]);
    e.commit(commitment(1));
    assert_eq!(status(&e)["badge"], "unverified");

    // A broken build: the enclave ran it and its checks failed.
    let mut failing = passing(&commitment(1));
    failing["pass"] = json!(false);
    run(&mut e, 20, failing);
    assert_eq!(status(&e)["badge"], "red");

    // A new epoch starts over: the old red run does not speak for it.
    at(accounts(0), 30, vec![]);
    e.commit(commitment(2));
    assert_eq!(status(&e)["badge"], "unverified");

    let i = run(&mut e, 40, passing(&commitment(2)));
    assert_eq!(status(&e)["badge"], "awaiting-proof");
    assert_eq!(status(&e)["latest_run"], i);
}

#[test]
fn only_a_quote_nears_verifier_accepted_turns_it_green() {
    let mut e = escrow();
    at(accounts(0), 10, vec![]);
    e.commit(commitment(1));
    let i = run(&mut e, 20, passing(&commitment(1)));

    let approved = include_str!("data/approved-measurements.json");
    at(me(), 30, vec![PromiseResult::Successful(approved.as_bytes().to_vec())]);
    let list = near_sdk::serde_json::from_str(approved).unwrap();
    assert!(e.on_measurements(Ok(list)) > 0);

    // The real bytes NEAR's DCAP verifier returned for request 25728's quote, and that run's task hash.
    let verified = include_bytes!("data/verify-quote-25728.borsh").to_vec();
    let task = "93f4eaec727aa5288f6159a1c86f6aff7877eb59687ec665f5d9d57bc8a6c8cc".to_string();
    at(me(), 40, vec![PromiseResult::Successful(verified.clone())]);
    let result = near_sdk::borsh::from_slice(&verified).unwrap();
    assert!(e.on_quote(i, task, Ok(result)));
    assert_eq!(status(&e)["badge"], "green");
    assert_eq!(status(&e)["proven_run"], i);
}

#[test]
#[should_panic(expected = "epochs only move forward")]
fn an_epoch_cannot_be_rolled_back() {
    let mut e = escrow();
    at(accounts(0), 10, vec![]);
    e.commit(commitment(2));
    e.commit(commitment(1));
}

#[test]
#[should_panic(expected = "release condition not met")]
fn nobody_releases_while_the_studio_is_alive() {
    let mut e = escrow();
    at(accounts(0), 10, vec![]);
    e.commit(commitment(1));
    at(accounts(2), GRACE_NS / 2, vec![]);
    let _ = e.release();
}

#[test]
fn a_silent_studio_is_released_by_anyone_and_cannot_reseal() {
    let mut e = escrow();
    at(accounts(0), 10, vec![]);
    e.commit(commitment(1));
    let lapse = GRACE_NS + 20;
    at(accounts(2), lapse, vec![]);
    assert_eq!(status(&e)["phase"], "silent");
    let _ = e.release();
    assert_eq!(status(&e)["phase"], "releasing");

    let ckd = json!({"big_y": "bls12381g1:y", "big_c": "bls12381g1:c"});
    at(me(), lapse + 1, vec![PromiseResult::Successful(ckd.to_string().into_bytes())]);
    assert!(e.on_released(accounts(2), Ok(near_sdk::serde_json::from_value(ckd).unwrap())));
    let s = status(&e);
    assert_eq!(s["phase"], "released");
    assert_eq!(s["released_by"], accounts(2).to_string());

    at(accounts(0), lapse + 2, vec![]);
    let reseal = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| e.commit(commitment(2))));
    assert!(reseal.is_err(), "a released escrow cannot be re-sealed");
}
