//! Cross-checks against near/mpc `crates/threshold-signatures/tests/vectors/ckd_test_vectors.json`.

use ark_bls12_381::{Fr, G1Affine};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::PrimeField;
use encore_crypto::ckd::{g1_from_bytes, g1_to_bytes, hash_point, unmask_response, verify_release};
use encore_crypto::ibe::{open_key, seal_key};
use hkdf::Hkdf;
use sha2::Sha256;

fn hx<const N: usize>(v: &serde_json::Value, k: &str) -> [u8; N] {
    hex::decode(v[k].as_str().unwrap()).unwrap().try_into().unwrap()
}

fn vectors() -> Vec<serde_json::Value> {
    let raw = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/data/ckd_test_vectors.json")).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&raw).unwrap();
    doc["vectors"].as_array().unwrap().clone()
}

#[test]
fn hash_point_matches_near_mpc() {
    for v in vectors() {
        let pk: [u8; 96] = hx(&v, "pk");
        let app_id: [u8; 32] = hx(&v, "app_id");
        let expected: [u8; 48] = hx(&v, "hash_point");
        assert_eq!(g1_to_bytes(&hash_point(&pk, &app_id).unwrap()), expected);
    }
}

#[test]
fn released_signature_verifies_and_unmasks() {
    for v in vectors() {
        let pk: [u8; 96] = hx(&v, "pk");
        let app_id: [u8; 32] = hx(&v, "app_id");
        let sig = g1_from_bytes(&hx::<48>(&v, "sig")).unwrap();
        assert!(verify_release(&pk, &app_id, &sig).unwrap());
        let a = Fr::from_be_bytes_mod_order(&hx::<32>(&v, "a"));
        let y = g1_from_bytes(&hx::<48>(&v, "big_y")).unwrap();
        let c = g1_from_bytes(&hx::<48>(&v, "big_c")).unwrap();
        assert_eq!(unmask_response(&y, &c, &a), sig);
        let s: [u8; 32] = hx(&v, "s");
        let mut out = [0u8; 32];
        Hkdf::<Sha256>::new(None, &g1_to_bytes(&sig)).expand(b"", &mut out).unwrap();
        assert_eq!(out, s);
    }
}

#[test]
fn ibe_round_trip_with_vector_msk() {
    let v = &vectors()[0];
    let pk: [u8; 96] = hx(v, "pk");
    let app_id: [u8; 32] = hx(v, "app_id");
    let msk = Fr::from_be_bytes_mod_order(&hx::<32>(v, "msk"));
    let sig: G1Affine = (hash_point(&pk, &app_id).unwrap() * msk).into_affine();
    let k = [7u8; 32];
    let sealed = seal_key(&pk, &app_id, &k, &[9u8; 32]).unwrap();
    assert_eq!(open_key(&pk, &app_id, &sig, &sealed).unwrap(), k);
    let wrong: G1Affine = (G1Affine::generator() * msk).into_affine();
    assert_ne!(open_key(&pk, &app_id, &wrong, &sealed).unwrap(), k);
    assert!(!verify_release(&pk, &app_id, &wrong).unwrap());
}

#[test]
fn identity_encodings_are_zcash_infinity() {
    let g1 = encore_crypto::ckd::g1_identity_bytes();
    let g2 = encore_crypto::ckd::g2_identity_bytes();
    assert_eq!(g1[0], 0xc0);
    assert!(g1[1..].iter().all(|b| *b == 0));
    assert_eq!(g2[0], 0xc0);
    assert!(g2[1..].iter().all(|b| *b == 0));
}
