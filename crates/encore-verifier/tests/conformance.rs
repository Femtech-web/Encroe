//! Offline checks of the verifier with a known master secret (near/mpc CKD test vector 0).
//! Requires the cores: `scripts/build/all.sh` (crates/encore-core-game, normal and `broken`).

use ark_bls12_381::Fr;
use ark_ec::CurveGroup;
use ark_ff::PrimeField;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use encore_crypto::ckd::{derive_app_id, g1_to_bytes, hash_point, near_bls_string};
use encore_crypto::game::{merkle_root, player_leaf, Player};
use encore_crypto::ibe::seal_key;
use encore_crypto::package::{aad, seal_bytes, sha256, Package};
use encore_verifier::{run, Input, Secret};

const ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
const VECTOR_PK: &str = "acd353f38a555fa11a929f391a19240d6b24d4f721db16db3fad73a3d29ce7220142cd69b8665d510af239b91f8c98140f651de3bd6be6061f03c9b21438f444f965fd6e1d0afdc44b66f16cd217fb02ad2f0409b51b98af54551781a48a6707";
const VECTOR_MSK: &str = "13e0c575c3ac888bf8815e0ed50166ed3560ffbe9fcf5917551d3bd56be291f8";

fn core(broken: bool) -> Vec<u8> {
    let dir = if broken { "target-broken" } else { "target" };
    std::fs::read(format!("{ROOT}/crates/encore-core-game/{dir}/wasm32-unknown-unknown/release/encore_core_game.wasm"))
        .expect("build the cores first: scripts/build/all.sh")
}

fn players() -> Vec<Player> {
    (0..20u8)
        .map(|i| Player { pk: [i + 1; 32], items: vec![(1, (i % 5 + 1) as u32), (3, 2), ((i % 8 + 1) as u32, 4)].into_iter().fold(Vec::new(), |mut v: Vec<(u32, u32)>, (id, q)| {
            match v.iter_mut().find(|(x, _)| *x == id) { Some(e) => e.1 += q, None => v.push((id, q)) }
            v.sort_by_key(|(x, _)| *x);
            v
        }), salt: [i ^ 0x5a; 32] })
        .collect()
}

struct Fixture {
    input: Input,
    secret: Secret,
    sig_hex: String,
}

fn fixture(core_bytes: Vec<u8>, committed_core: &[u8]) -> Fixture {
    let pk: [u8; 96] = hex::decode(VECTOR_PK).unwrap().try_into().unwrap();
    let (predecessor, path) = ("encore-test.testnet", "encore/test/1");
    let app_id = derive_app_id(predecessor, path);
    let (k, r) = ([0x11u8; 32], [0x22u8; 32]);
    let package = Package { v: 1, game: "g".into(), epoch: 1, core_wasm_b64: B64.encode(&core_bytes), players: players() };
    let sealed = seal_bytes(&k, &[3u8; 12], &serde_json::to_vec(&package).unwrap(), &aad("g", 1)).unwrap();
    let leaves: Vec<[u8; 32]> = package.players.iter().map(|p| player_leaf("g", 1, p)).collect();
    let sk = seal_key(&pk, &app_id, &k, &r).unwrap();
    let msk = Fr::from_be_bytes_mod_order(&hex::decode(VECTOR_MSK).unwrap());
    let sig = (hash_point(&pk, &app_id).unwrap() * msk).into_affine();
    Fixture {
        input: Input {
            v: 1,
            game: "g".into(),
            epoch: 1,
            predecessor: predecessor.into(),
            path: path.into(),
            domain_id: 2,
            ckd_pk: near_bls_string("bls12381g2", &pk),
            app_id: hex::encode(app_id),
            sealed_u: hex::encode(sk.u),
            sealed_v: hex::encode(sk.v),
            pkg_b64: B64.encode(&sealed),
            pkg_sha256: hex::encode(sha256(&sealed)),
            root: hex::encode(merkle_root(&leaves)),
            core_sha256: hex::encode(sha256(committed_core)),
            seed: hex::encode([7u8; 32]),
            released_sig: None,
        },
        secret: Secret { k, r },
        sig_hex: hex::encode(g1_to_bytes(&sig)),
    }
}

#[test]
fn secret_and_release_modes_agree() {
    let c = core(false);
    let f = fixture(c.clone(), &c);
    let a = run(&f.input, Some(&f.secret));
    assert!(a.pass, "{a:?}");
    let mut released = f.input.clone();
    released.released_sig = Some(f.sig_hex.clone());
    let b = run(&released, None);
    assert!(b.pass, "{b:?}");
    assert_eq!(a.transcript_sha256, b.transcript_sha256);
    assert_eq!(a.sampled, 16);
}

#[test]
fn broken_core_is_rejected() {
    let c = core(true);
    let f = fixture(c.clone(), &c);
    let out = run(&f.input, Some(&f.secret));
    assert!(!out.checks.states_served);
    assert!(!out.pass);
}

#[test]
fn swapped_core_breaks_core_hash() {
    let f = fixture(core(true), &core(false));
    let out = run(&f.input, Some(&f.secret));
    assert!(!out.checks.core_sha256 && !out.pass);
}

#[test]
fn wrong_secret_fails_key_binding() {
    let c = core(false);
    let f = fixture(c.clone(), &c);
    let out = run(&f.input, Some(&Secret { k: f.secret.k, r: [0x33; 32] }));
    assert!(!out.checks.key_binding && !out.pass);
}

#[test]
fn tampered_package_is_rejected() {
    let c = core(false);
    let mut f = fixture(c.clone(), &c);
    let mut bytes = B64.decode(&f.input.pkg_b64).unwrap();
    let last = bytes.len() - 1;
    bytes[last] ^= 1;
    f.input.pkg_b64 = B64.encode(bytes);
    let out = run(&f.input, Some(&f.secret));
    assert!(!out.pass && !out.checks.pkg_sha256);
}

#[test]
fn wrong_released_key_is_rejected() {
    let c = core(false);
    let mut f = fixture(c.clone(), &c);
    f.input.released_sig = Some(hex::encode(g1_to_bytes(&ark_bls12_381::G1Affine::new_unchecked(
        ark_bls12_381::g1::G1_GENERATOR_X,
        ark_bls12_381::g1::G1_GENERATOR_Y,
    ))));
    let out = run(&f.input, None);
    assert!(!out.checks.key_binding && !out.pass);
}

#[test]
fn other_identity_does_not_bind() {
    let c = core(false);
    let mut f = fixture(c.clone(), &c);
    f.input.predecessor = "someone-else.testnet".into();
    let out = run(&f.input, Some(&f.secret));
    assert!(!out.checks.app_id && !out.pass);
}
