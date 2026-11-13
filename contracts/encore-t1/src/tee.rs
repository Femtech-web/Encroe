//! T1: an OutLayer run's TDX quote, verified on NEAR.
//!
//! OutLayer publishes one attestation per execution. SHA-256 over its task fields, in OutLayer's order
//! (`worker/src/tdx_attestation.rs`), is the first half of the quote's report_data (the rest is zero).
//! This contract recomputes that hash from the attestation, checks every field against its own record of
//! the run it requested, has NEAR's DCAP verifier check the quote, and accepts only worker images in
//! OutLayer's approved list. The same checks `encore-attest` runs off-chain, now on-chain.

use near_sdk::{env, near};

/// OutLayer's per-execution attestation (the fields the report_data binds).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Attestation {
    pub task_type: String,
    pub task_id: i64,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub commit: Option<String>,
    pub build_target: Option<String>,
    pub wasm_hash: Option<String>,
    pub input_hash: Option<String>,
    pub output_hash: String,
    pub block_height: Option<u64>,
    pub caller_account_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub secrets_ref: Option<String>,
    pub timestamp: i64,
    pub attached_usd: Option<String>,
}

impl Attestation {
    pub fn task_hash(&self) -> Vec<u8> {
        let mut m: Vec<u8> = Vec::new();
        m.extend(self.task_type.as_bytes());
        m.extend(self.task_id.to_le_bytes());
        for s in [&self.repo, &self.commit, &self.build_target, &self.wasm_hash, &self.input_hash].into_iter().flatten() {
            m.extend(s.as_bytes());
        }
        m.extend(self.output_hash.as_bytes());
        if let Some(h) = self.block_height {
            m.extend(h.to_le_bytes());
        }
        for s in [&self.caller_account_id, &self.project_id, &self.secrets_ref].into_iter().flatten() {
            m.extend(s.as_bytes());
        }
        m.extend(self.timestamp.to_le_bytes());
        if let Some(u) = &self.attached_usd {
            m.extend(u.as_bytes());
        }
        env::sha256(&m)
    }
}

/// What the contract recorded about a run; the attestation must describe exactly this.
pub struct RunRecord<'a> {
    pub wasm_hash: &'a str,
    pub input_sha256: &'a str,
    pub output_sha256: &'a str,
    pub requester: &'a str,
    pub secrets_ref: &'a str,
}

pub fn check_binding(a: &Attestation, r: &RunRecord, this: &str) -> Result<(), &'static str> {
    if a.task_type != "execute" {
        return Err("attestation: not an execution");
    }
    if a.build_target.as_deref() != Some("wasm32-wasip2") {
        return Err("attestation: build target");
    }
    if a.wasm_hash.as_deref() != Some(r.wasm_hash) {
        return Err("attestation: not the pinned verifier");
    }
    if a.input_hash.as_deref() != Some(r.input_sha256) {
        return Err("attestation: input differs from what this contract sent");
    }
    if a.output_hash != r.output_sha256 {
        return Err("attestation: output differs from what this contract received");
    }
    let caller = a.caller_account_id.as_deref();
    if !(caller == Some(r.requester) || caller == Some(this)) {
        return Err("attestation: another caller");
    }
    if a.secrets_ref.as_deref() != Some(r.secrets_ref) {
        return Err("attestation: another secret row");
    }
    if a.repo.is_some() || a.commit.is_some() || a.project_id.is_some() {
        return Err("attestation: not a WasmUrl run");
    }
    Ok(())
}

/// One approved worker image (OutLayer's `get_approved_measurements` entry), lowercase hex.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Measurements {
    pub mrtd: String,
    pub rtmr0: String,
    pub rtmr1: String,
    pub rtmr2: String,
    pub rtmr3: String,
}

// Borsh mirrors of near/mpc `tee-verifier-interface`: what the DCAP verifier's `verify_quote` returns.

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
#[allow(clippy::large_enum_variant)]
pub enum VerificationResult {
    Verified(VerifiedReport),
    Rejected(VerifierError),
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub enum VerifierError {
    DcapVerification(String),
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct VerifiedReport {
    pub status: String,
    pub advisory_ids: Vec<String>,
    pub report: Report,
    pub ppid: Vec<u8>,
    pub qe_status: TcbStatusWithAdvisory,
    pub platform_status: TcbStatusWithAdvisory,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
#[allow(clippy::large_enum_variant)]
pub enum Report {
    SgxEnclave(EnclaveReport),
    TD10(TDReport10),
    TD15(TDReport15),
    TD15Ex(TDReport15Ex),
}

impl Report {
    pub fn td10(&self) -> Option<&TDReport10> {
        match self {
            Report::TD10(r) => Some(r),
            Report::TD15(r) => Some(&r.base),
            Report::TD15Ex(r) => Some(&r.base.base),
            Report::SgxEnclave(_) => None,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct TDReport10 {
    pub tee_tcb_svn: [u8; 16],
    pub mr_seam: [u8; 48],
    pub mr_signer_seam: [u8; 48],
    pub seam_attributes: [u8; 8],
    pub td_attributes: [u8; 8],
    pub xfam: [u8; 8],
    pub mr_td: [u8; 48],
    pub mr_config_id: [u8; 48],
    pub mr_owner: [u8; 48],
    pub mr_owner_config: [u8; 48],
    pub rt_mr0: [u8; 48],
    pub rt_mr1: [u8; 48],
    pub rt_mr2: [u8; 48],
    pub rt_mr3: [u8; 48],
    pub report_data: [u8; 64],
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct TDReport15 {
    pub base: TDReport10,
    pub tee_tcb_svn2: [u8; 16],
    pub mr_service_td: [u8; 48],
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct TDReport15Ex {
    pub base: TDReport15,
    pub vmid: u8,
    pub td_id: [u8; 32],
    pub dev_info: [u8; 48],
    pub init_service_td_hash: [u8; 48],
    pub init_service_td_attributes: [u8; 8],
    pub init_cpu_svn: [u8; 16],
    pub init_tee_tcb_svn: [u8; 16],
    pub init_tee_fmspc: [u8; 12],
    pub cur_service_td_hash: [u8; 48],
    pub cur_service_td_attributes: [u8; 8],
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct EnclaveReport {
    pub cpu_svn: [u8; 16],
    pub misc_select: u32,
    pub reserved1: [u8; 28],
    pub attributes: [u8; 16],
    pub mr_enclave: [u8; 32],
    pub reserved2: [u8; 32],
    pub mr_signer: [u8; 32],
    pub reserved3: [u8; 96],
    pub isv_prod_id: u16,
    pub isv_svn: u16,
    pub reserved4: [u8; 60],
    pub report_data: [u8; 64],
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub enum TcbStatus {
    UpToDate,
    OutOfDateConfigurationNeeded,
    OutOfDate,
    ConfigurationAndSWHardeningNeeded,
    ConfigurationNeeded,
    SWHardeningNeeded,
    Revoked,
    TDRelaunchAdvised,
    TDRelaunchAdvisedConfigurationNeeded,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct TcbStatusWithAdvisory {
    pub status: TcbStatus,
    pub advisory_ids: Vec<String>,
}

pub fn measurements_of(td: &TDReport10) -> Measurements {
    Measurements {
        mrtd: hex::encode(td.mr_td),
        rtmr0: hex::encode(td.rt_mr0),
        rtmr1: hex::encode(td.rt_mr1),
        rtmr2: hex::encode(td.rt_mr2),
        rtmr3: hex::encode(td.rt_mr3),
    }
}

/// The verdict on a verifier result: accepted TCB status, report_data bound to `task_hash`, and an
/// approved worker image. Returns the TCB status.
pub fn judge_quote(result: &VerificationResult, task_hash: &[u8], approved: &[Measurements]) -> Result<String, String> {
    let report = match result {
        VerificationResult::Verified(r) => r,
        VerificationResult::Rejected(VerifierError::DcapVerification(e)) => return Err(format!("quote rejected: {e}")),
    };
    if report.status != "UpToDate" {
        return Err(format!("TCB status {}", report.status));
    }
    let td = report.report.td10().ok_or("not a TDX report")?;
    if td.report_data[..32] != *task_hash || td.report_data[32..].iter().any(|b| *b != 0) {
        return Err("report_data does not bind this run".into());
    }
    if !approved.contains(&measurements_of(td)) {
        return Err("worker image not in OutLayer's approved list".into());
    }
    Ok(report.status.clone())
}

/// Arguments for `verify_quote`: borsh `(Vec<u8> quote, Collateral)`; the collateral arrives already
/// borsh-encoded (`encore-attest` writes it with ENCORE_VERIFY_QUOTE_ARGS).
pub fn verify_quote_args(quote: &[u8], collateral: &[u8]) -> Vec<u8> {
    let mut args = Vec::with_capacity(quote.len() + collateral.len() + 4);
    args.extend((quote.len() as u32).to_le_bytes());
    args.extend(quote);
    args.extend(collateral);
    args
}
