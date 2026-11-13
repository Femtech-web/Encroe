//! Encore readiness verifier. The same code runs:
//! - on OutLayer (secret mode: the keystore injects `ENCORE_K`/`ENCORE_R`), before release;
//! - anywhere (release mode: the public CKD release opens the sealed key), after release.
//! The conformance transcript does not depend on the mode, so both runs must print the same hash.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use encore_crypto::ckd::{derive_app_id, g1_from_bytes, parse_near_bls, verify_release};
use encore_crypto::game::{merkle_root, player_leaf, snapshot_binary, state_bytes};
use encore_crypto::ibe::{open_key, seal_key, SealedKey};
use encore_crypto::package::{aad, open_bytes, sha256, Package};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const VERIFIER_ID: &str = concat!("encore-verifier/", env!("CARGO_PKG_VERSION"));
pub const SAMPLE: usize = 16;
pub const TRADES: u32 = 32;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Input {
    pub v: u32,
    pub game: String,
    pub epoch: u64,
    pub predecessor: String,
    pub path: String,
    pub domain_id: u64,
    pub ckd_pk: String,
    pub app_id: String,
    pub sealed_u: String,
    pub sealed_v: String,
    pub pkg_b64: String,
    pub pkg_sha256: String,
    pub root: String,
    pub core_sha256: String,
    pub seed: String,
    /// Release mode only: the released CKD signature, `bls12381g1:<b58>` or 96-char hex.
    #[serde(default)]
    pub released_sig: Option<String>,
}

pub struct Secret {
    pub k: [u8; 32],
    pub r: [u8; 32],
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Checks {
    pub app_id: bool,
    pub pkg_sha256: bool,
    pub key_binding: bool,
    pub decrypt: bool,
    pub core_sha256: bool,
    pub root: bool,
    pub states_served: bool,
    pub conservation: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Output {
    pub verifier: String,
    pub mode: String,
    pub game: String,
    pub epoch: u64,
    pub pkg_sha256: String,
    pub sealed_key_sha256: String,
    pub root: String,
    pub core_sha256: String,
    pub seed: String,
    pub checks: Checks,
    pub sampled: u32,
    pub trades_applied: u32,
    pub transcript_sha256: Option<String>,
    pub pass: bool,
    pub error: Option<String>,
}

fn h32(s: &str) -> Result<[u8; 32], String> {
    hex::decode(s).ok().and_then(|v| v.try_into().ok()).ok_or_else(|| format!("bad 32-byte hex: {s}"))
}

pub fn run(input: &Input, secret: Option<&Secret>) -> Output {
    let mut out = Output {
        verifier: VERIFIER_ID.to_string(),
        mode: if secret.is_some() { "secret" } else { "release" }.to_string(),
        game: input.game.clone(),
        epoch: input.epoch,
        pkg_sha256: input.pkg_sha256.clone(),
        sealed_key_sha256: String::new(),
        root: input.root.clone(),
        core_sha256: input.core_sha256.clone(),
        seed: input.seed.clone(),
        checks: Checks::default(),
        sampled: 0,
        trades_applied: 0,
        transcript_sha256: None,
        pass: false,
        error: None,
    };
    if let Err(e) = run_inner(input, secret, &mut out) {
        out.error = Some(e);
    }
    let c = &out.checks;
    out.pass = out.error.is_none()
        && c.app_id && c.pkg_sha256 && c.key_binding && c.decrypt && c.core_sha256 && c.root && c.states_served && c.conservation;
    out
}

fn run_inner(input: &Input, secret: Option<&Secret>, out: &mut Output) -> Result<(), String> {
    let app_id = h32(&input.app_id)?;
    out.checks.app_id = derive_app_id(&input.predecessor, &input.path) == app_id;
    let pk: [u8; 96] = parse_near_bls(&input.ckd_pk, "bls12381g2", 96).map_err(|e| e.to_string())?.try_into().unwrap();
    let sealed = SealedKey {
        u: hex::decode(&input.sealed_u).ok().and_then(|v| v.try_into().ok()).ok_or("bad sealed_u")?,
        v: h32(&input.sealed_v)?,
    };
    out.sealed_key_sha256 = hex::encode(sealed.hash());

    let pkg = B64.decode(&input.pkg_b64).map_err(|_| "bad pkg_b64")?;
    out.checks.pkg_sha256 = hex::encode(sha256(&pkg)) == input.pkg_sha256;

    let k = match secret {
        Some(s) => {
            out.checks.key_binding = seal_key(&pk, &app_id, &s.k, &s.r).map_err(|e| e.to_string())? == sealed;
            s.k
        }
        None => {
            let sig_s = input.released_sig.as_deref().ok_or("release mode needs released_sig")?;
            let sig_b = if sig_s.starts_with("bls12381g1:") {
                parse_near_bls(sig_s, "bls12381g1", 48).map_err(|e| e.to_string())?
            } else {
                hex::decode(sig_s).map_err(|_| "bad released_sig hex")?
            };
            let sig = g1_from_bytes(&sig_b).map_err(|e| e.to_string())?;
            out.checks.key_binding = verify_release(&pk, &app_id, &sig).map_err(|e| e.to_string())?;
            open_key(&pk, &app_id, &sig, &sealed).map_err(|e| e.to_string())?
        }
    };

    let plain = open_bytes(&k, &pkg, &aad(&input.game, input.epoch)).map_err(|e| e.to_string())?;
    let package: Package = serde_json::from_slice(&plain).map_err(|e| format!("package json: {e}"))?;
    out.checks.decrypt = package.game == input.game && package.epoch == input.epoch;

    let core = package.core_wasm().map_err(|e| e.to_string())?;
    out.checks.core_sha256 = hex::encode(sha256(&core)) == input.core_sha256;
    let leaves: Vec<[u8; 32]> = package.players.iter().map(|p| player_leaf(&package.game, package.epoch, p)).collect();
    out.checks.root = hex::encode(merkle_root(&leaves)) == input.root;

    let seed = h32(&input.seed)?;
    conformance(&core, &package, &seed, out)
}

fn draw(seed: &[u8; 32], label: &[u8], i: u32) -> u32 {
    let d = Sha256::new().chain_update(seed).chain_update(label).chain_update(i.to_le_bytes()).finalize();
    u32::from_le_bytes([d[0], d[1], d[2], d[3]])
}

fn totals(states: &[Vec<u8>]) -> std::collections::BTreeMap<u32, u64> {
    let mut t = std::collections::BTreeMap::new();
    for s in states {
        let n = u32::from_le_bytes(s[0..4].try_into().unwrap()) as usize;
        for i in 0..n {
            let id = u32::from_le_bytes(s[4 + 8 * i..8 + 8 * i].try_into().unwrap());
            let q = u32::from_le_bytes(s[8 + 8 * i..12 + 8 * i].try_into().unwrap()) as u64;
            *t.entry(id).or_insert(0) += q;
        }
    }
    t
}

/// Loads the sealed snapshot into the sealed core (via wasmi), checks the core serves the
/// committed state of seed-sampled players, applies seed-derived trades and checks item
/// conservation. Every observation goes into the transcript hash.
fn conformance(core: &[u8], package: &Package, seed: &[u8; 32], out: &mut Output) -> Result<(), String> {
    use wasmi::{Engine, Linker, Module, Store};
    let engine = Engine::default();
    let module = Module::new(&engine, core).map_err(|e| format!("core module: {e}"))?;
    let mut store = Store::new(&engine, ());
    let linker = Linker::<()>::new(&engine);
    let instance = linker
        .instantiate(&mut store, &module)
        .and_then(|pre| pre.start(&mut store))
        .map_err(|e| format!("core instantiate: {e}"))?;
    let memory = instance.get_memory(&store, "memory").ok_or("core exports no memory")?;
    let f_in = instance.get_typed_func::<(), i32>(&store, "input_ptr").map_err(|e| e.to_string())?;
    let f_out = instance.get_typed_func::<(), i32>(&store, "output_ptr").map_err(|e| e.to_string())?;
    let f_load = instance.get_typed_func::<i32, i32>(&store, "load").map_err(|e| e.to_string())?;
    let f_get = instance.get_typed_func::<i32, i32>(&store, "get_state").map_err(|e| e.to_string())?;
    let f_trade = instance.get_typed_func::<(i32, i32, i32, i32), i32>(&store, "trade").map_err(|e| e.to_string())?;

    let snap = snapshot_binary(&package.players);
    let in_ptr = f_in.call(&mut store, ()).map_err(|e| e.to_string())? as usize;
    let out_ptr = f_out.call(&mut store, ()).map_err(|e| e.to_string())? as usize;
    memory.write(&mut store, in_ptr, &snap).map_err(|e| e.to_string())?;
    let n = package.players.len();
    let loaded = f_load.call(&mut store, snap.len() as i32).map_err(|e| e.to_string())?;
    if loaded != n as i32 {
        return Err(format!("core loaded {loaded} players, snapshot has {n}"));
    }

    let mut transcript = Sha256::new();
    transcript.update(b"encore-transcript-v1");
    transcript.update(seed);
    let read_state = |store: &mut Store<()>, idx: usize| -> Result<Vec<u8>, String> {
        let len = f_get.call(&mut *store, idx as i32).map_err(|e| e.to_string())?;
        if len < 4 {
            return Err(format!("get_state({idx}) returned {len}"));
        }
        let mut buf = vec![0u8; len as usize];
        memory.read(&*store, out_ptr, &mut buf).map_err(|e| e.to_string())?;
        Ok(buf)
    };

    let mut sampled = Vec::new();
    let mut i = 0;
    while sampled.len() < SAMPLE.min(n) {
        let idx = (draw(seed, b"sample", i) as usize) % n;
        if !sampled.contains(&idx) {
            sampled.push(idx);
        }
        i += 1;
    }
    let mut served = true;
    for &idx in &sampled {
        let got = read_state(&mut store, idx)?;
        served &= got == state_bytes(&package.players[idx].items);
        transcript.update((idx as u32).to_le_bytes());
        transcript.update(&got);
    }
    out.checks.states_served = served;
    out.sampled = sampled.len() as u32;

    let before: Vec<Vec<u8>> = (0..n).map(|i| read_state(&mut store, i)).collect::<Result<_, _>>()?;
    let mut applied = 0;
    for t in 0..TRADES {
        let from = (draw(seed, b"from", t) as usize % n) as i32;
        let to = (draw(seed, b"to", t) as usize % n) as i32;
        let item = (draw(seed, b"item", t) % 8 + 1) as i32;
        let qty = (draw(seed, b"qty", t) % 3 + 1) as i32;
        let code = f_trade.call(&mut store, (from, to, item, qty)).map_err(|e| e.to_string())?;
        if code == 0 {
            applied += 1;
        }
        transcript.update([from, to, item, qty, code].iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>());
    }
    let after: Vec<Vec<u8>> = (0..n).map(|i| read_state(&mut store, i)).collect::<Result<_, _>>()?;
    for s in &after {
        transcript.update(s);
    }
    out.checks.conservation = totals(&before) == totals(&after);
    out.trades_applied = applied;
    out.transcript_sha256 = Some(hex::encode(transcript.finalize()));
    Ok(())
}
