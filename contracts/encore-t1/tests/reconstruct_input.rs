//! Rebuilds the exact `input_data` string `request_run` sends to OutLayer (same json! shape,
//! same near_sdk::serde_json build), so a third party can check the attested input_hash.
//! ENCORE_COMMITMENT=… ENCORE_PKG_B64=… ENCORE_SEED=… ENCORE_PREDECESSOR=… ENCORE_OUT=… cargo test --test reconstruct_input
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{self, json, Value};

#[test]
fn reconstruct_input() {
    let Ok(commitment) = std::env::var("ENCORE_COMMITMENT") else { return };
    let c: Value = serde_json::from_str(&std::fs::read_to_string(commitment).unwrap()).unwrap();
    let b64 = std::fs::read_to_string(std::env::var("ENCORE_PKG_B64").unwrap()).unwrap();
    let package: Base64VecU8 = serde_json::from_value(Value::String(b64.trim().to_string())).unwrap();
    let input = json!({
        "v": 1,
        "game": c["game"],
        "epoch": c["epoch"].as_u64().unwrap(),
        "predecessor": std::env::var("ENCORE_PREDECESSOR").unwrap(),
        "path": c["path"],
        "domain_id": c["domain_id"].as_u64().unwrap(),
        "ckd_pk": c["ckd_pk"],
        "app_id": c["app_id"],
        "sealed_u": c["sealed_key"]["u"],
        "sealed_v": c["sealed_key"]["v"],
        "pkg_b64": package,
        "pkg_sha256": c["pkg_sha256"],
        "root": c["root"],
        "core_sha256": c["core_sha256"],
        "seed": std::env::var("ENCORE_SEED").unwrap(),
    });
    std::fs::write(std::env::var("ENCORE_OUT").unwrap(), input.to_string()).unwrap();
}
