//! Independent check of an OutLayer per-execution attestation, with no trust in OutLayer's
//! collateral: the quote is verified by dcap-qvl against collateral fetched from Intel PCS, its
//! measurements are matched against the register contract's approved list, and its report_data
//! is recomputed from the task fields (worker/src/tdx_attestation.rs, V1 layout).
//!
//! usage: encore-attest <attestation.json> <approved-measurements.json> [input_data.txt] [contract-output.json]

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use dcap_qvl::collateral::{CollateralClient, INTEL_PCS_URL};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn s<'a>(a: &'a Value, k: &str) -> Result<&'a str> {
    a[k].as_str().ok_or_else(|| anyhow!("attestation lacks string field {k}"))
}

fn n(a: &Value, k: &str) -> Result<i64> {
    a[k].as_i64().or_else(|| a[k].as_str().and_then(|v| v.parse().ok())).ok_or_else(|| anyhow!("attestation lacks integer field {k}"))
}

/// SHA256(task_type || task_id || [repo] || [commit] || build_target || wasm_hash || input_hash ||
/// output_hash || block_height || caller || [project_id] || secrets_ref || timestamp || attached_usd)
fn task_hash(a: &Value) -> Result<[u8; 32]> {
    let mut h = Sha256::new();
    h.update(s(a, "task_type")?.as_bytes());
    h.update(n(a, "task_id")?.to_le_bytes());
    for opt in ["repo", "commit", "build_target", "wasm_hash", "input_hash"] {
        if let Some(v) = a[opt].as_str() {
            h.update(v.as_bytes());
        }
    }
    h.update(s(a, "output_hash")?.as_bytes());
    if !a["block_height"].is_null() {
        h.update((n(a, "block_height")? as u64).to_le_bytes());
    }
    for opt in ["caller_account_id", "project_id", "secrets_ref"] {
        if let Some(v) = a[opt].as_str() {
            h.update(v.as_bytes());
        }
    }
    h.update(n(a, "timestamp")?.to_le_bytes());
    if let Some(v) = a["attached_usd"].as_str() {
        h.update(v.as_bytes());
    }
    Ok(h.finalize().into())
}

fn borsh_bytes(out: &mut Vec<u8>, b: &[u8]) {
    out.extend((b.len() as u32).to_le_bytes());
    out.extend(b);
}

/// Arguments for NEAR's DCAP verifier `verify_quote`: borsh `(Vec<u8> quote, Collateral)`, the
/// collateral's fields in dcap-qvl's `QuoteCollateralV3` order.
fn verify_quote_args(quote: &[u8], c: &dcap_qvl::QuoteCollateralV3) -> Vec<u8> {
    let mut out = Vec::new();
    borsh_bytes(&mut out, quote);
    borsh_bytes(&mut out, c.pck_crl_issuer_chain.as_bytes());
    borsh_bytes(&mut out, &c.root_ca_crl);
    borsh_bytes(&mut out, &c.pck_crl);
    borsh_bytes(&mut out, c.tcb_info_issuer_chain.as_bytes());
    borsh_bytes(&mut out, c.tcb_info.as_bytes());
    borsh_bytes(&mut out, &c.tcb_info_signature);
    borsh_bytes(&mut out, c.qe_identity_issuer_chain.as_bytes());
    borsh_bytes(&mut out, c.qe_identity.as_bytes());
    borsh_bytes(&mut out, &c.qe_identity_signature);
    match &c.pck_certificate_chain {
        Some(p) => {
            out.push(1);
            borsh_bytes(&mut out, p.as_bytes());
        }
        None => out.push(0),
    }
    out
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        bail!("usage: [ENCORE_VERIFY_QUOTE_ARGS=<out>] encore-attest <attestation.json> <approved-measurements.json> [input_data.txt] [contract-output.json]");
    }
    let att: Value = serde_json::from_str(&std::fs::read_to_string(&args[1])?).context("attestation json")?;
    let approved: Value = serde_json::from_str(&std::fs::read_to_string(&args[2])?).context("measurements json")?;
    let quote = B64.decode(s(&att, "tdx_quote")?).context("quote base64")?;

    let collateral = CollateralClient::with_default_http(INTEL_PCS_URL)?.fetch(&quote).await.context("Intel PCS collateral")?;
    // Optional: the same quote and collateral as NEAR's on-chain DCAP verifier takes them (base64).
    if let Ok(path) = std::env::var("ENCORE_VERIFY_QUOTE_ARGS") {
        let args = verify_quote_args(&quote, &collateral);
        std::fs::write(&path, B64.encode(&args))?;
        // The collateral alone, as `prove_run` takes it (the args minus the length-prefixed quote).
        std::fs::write(format!("{path}.collateral"), B64.encode(&args[4 + quote.len()..]))?;
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
    let report = dcap_qvl::verify::verify(&quote, &collateral, now).map_err(|e| anyhow!("quote verification failed: {e:?}"))?;
    let td = report
        .report
        .as_td10()
        .cloned()
        .or_else(|| report.report.as_td15().map(|r| r.base.clone()))
        .ok_or_else(|| anyhow!("not a TDX report"))?;

    let m = json!({
        "mrtd": hex::encode(td.mr_td), "rtmr0": hex::encode(td.rt_mr0), "rtmr1": hex::encode(td.rt_mr1),
        "rtmr2": hex::encode(td.rt_mr2), "rtmr3": hex::encode(td.rt_mr3),
    });
    let measurements_approved = approved.as_array().map(|a| a.iter().any(|e| e == &m)).unwrap_or(false);

    let expected_task = task_hash(&att)?;
    let report_data_binds_task = td.report_data[..32] == expected_task && td.report_data[32..].iter().all(|b| *b == 0);

    let input_hash_matches = match args.get(3).filter(|p| !p.is_empty()) {
        Some(p) => Some(hex::encode(Sha256::digest(std::fs::read(p)?)) == s(&att, "input_hash")?),
        None => None,
    };
    let output_hash_matches = match args.get(4).filter(|p| !p.is_empty()) {
        Some(p) => {
            let v: Value = serde_json::from_str(&std::fs::read_to_string(p)?)?;
            Some(hex::encode(Sha256::digest(serde_json::to_string(&v)?.as_bytes())) == s(&att, "output_hash")?)
        }
        None => None,
    };
    let wasm_matches = att["wasm_hash"] == att["executed_wasm_sha256"];

    let result = json!({
        "request_id": att["request_id"],
        "quote_signature_chain_and_tcb_verified": true,
        "tcb_status": report.status,
        "advisory_ids": report.advisory_ids,
        "measurements": m,
        "measurements_in_approved_list": measurements_approved,
        "report_data_binds_task_fields": report_data_binds_task,
        "executed_wasm_sha256": att["executed_wasm_sha256"],
        "wasm_hash_equals_executed": wasm_matches,
        "input_hash_matches_reconstructed_input": input_hash_matches,
        "output_hash_matches_contract_output": output_hash_matches,
        "caller": att["caller_account_id"], "secrets_ref": att["secrets_ref"], "block_height": att["block_height"],
    });
    println!("{}", serde_json::to_string_pretty(&result)?);
    let ok = measurements_approved && report_data_binds_task && wasm_matches && input_hash_matches != Some(false) && output_hash_matches != Some(false);
    if !ok {
        bail!("attestation check failed");
    }
    Ok(())
}
