//! T1 on real data: OutLayer request 25728 (Encore E2), the bytes NEAR's DCAP verifier
//! (`tee-verifier-2026-07-22.testnet`, `verify_quote` as a view) returned for its quote with fresh
//! Intel PCS collateral, and OutLayer's approved worker images at that time.

use encroe_escrow::tee::{check_binding, judge_quote, Attestation, Measurements, RunRecord, VerificationResult};
use near_sdk::borsh::BorshDeserialize;

fn attestation() -> Attestation {
    near_sdk::serde_json::from_str(include_str!("data/attestation-25728.json")).unwrap()
}

fn verifier_result() -> VerificationResult {
    VerificationResult::try_from_slice(include_bytes!("data/verify-quote-25728.borsh")).unwrap()
}

fn approved() -> Vec<Measurements> {
    near_sdk::serde_json::from_str(include_str!("data/approved-measurements.json")).unwrap()
}

const SECRETS_REF: &str = "encore-pub-6b4dad.testnet/encore-g1-1";

fn record<'a>() -> RunRecord<'a> {
    RunRecord {
        wasm_hash: "9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad",
        input_sha256: "53ea774b3b530369535f5e14cd4ec3ffb5c9dd40dcf4f6f89642c51ad5f638f2",
        output_sha256: "776157fe1dd99cf88dede2d0973038c7d61061d755c64d4f9a4ed775fb286354",
        requester: "encore-stranger-6b4dad.testnet",
        secrets_ref: SECRETS_REF,
    }
}

#[test]
fn task_hash_matches_the_quotes_report_data() {
    assert_eq!(hex::encode(attestation().task_hash()), "93f4eaec727aa5288f6159a1c86f6aff7877eb59687ec665f5d9d57bc8a6c8cc");
}

#[test]
fn real_verifier_output_is_accepted_for_its_run() {
    let r = verifier_result();
    assert!(matches!(r, VerificationResult::Verified(_)));
    assert_eq!(judge_quote(&r, &attestation().task_hash(), &approved()), Ok("UpToDate".to_string()));
}

#[test]
fn real_quote_is_refused_for_another_run_or_an_unapproved_image() {
    let r = verifier_result();
    let mut other = attestation();
    other.output_hash = "00".repeat(32);
    assert_eq!(judge_quote(&r, &other.task_hash(), &approved()), Err("report_data does not bind this run".into()));
    assert_eq!(judge_quote(&r, &attestation().task_hash(), &[]), Err("worker image not in OutLayer's approved list".into()));
}

#[test]
fn attestation_must_describe_the_run_this_contract_requested() {
    let a = attestation();
    assert_eq!(check_binding(&a, &record(), "encore-t1.testnet"), Ok(()));

    let mut r = record();
    r.output_sha256 = "ab";
    assert!(check_binding(&a, &r, "encore-t1.testnet").is_err(), "another output");
    let mut r = record();
    r.input_sha256 = "ab";
    assert!(check_binding(&a, &r, "encore-t1.testnet").is_err(), "another input");
    let mut r = record();
    r.wasm_hash = "401a820b";
    assert!(check_binding(&a, &r, "encore-t1.testnet").is_err(), "another build (the thief)");
    let mut r = record();
    r.requester = "someone-else.testnet";
    assert!(check_binding(&a, &r, "encore-t1.testnet").is_err(), "another caller");
    let mut r = record();
    r.secrets_ref = "encore-pub-6b4dad.testnet/other";
    assert!(check_binding(&a, &r, "encore-t1.testnet").is_err(), "another secret row");
}
