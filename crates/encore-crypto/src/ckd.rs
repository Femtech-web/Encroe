//! NEAR MPC Confidential Key Derivation (CKD) compatibility.
//!
//! Mirrors near/mpc: `derive_app_id` (crates/near-mpc-crypto-types/src/kdf.rs) and
//! `hash_app_id_with_pk` (crates/contract/src/primitives/ckd.rs). The MPC network's
//! released value for `(predecessor, path)` is the BLS signature `sig = msk * H(pk || app_id)`.

use ark_bls12_381::{g1, Bls12_381, Fr, G1Affine, G1Projective, G2Affine};
use ark_ec::hashing::{curve_maps::wb::WBMap, map_to_curve_hasher::MapToCurveBasedHasher, HashToCurve};
use ark_ec::pairing::Pairing;
use ark_ec::AffineRepr;
use ark_ff::field_hashers::DefaultFieldHasher;
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use sha2::Sha256;
use sha3::{Digest, Sha3_256};

use crate::Error;

pub const APP_ID_DERIVATION_PREFIX: &str = "near-mpc v0.1.0 app_id derivation:";
pub const NEAR_CKD_DOMAIN: &[u8] = b"NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_";

pub fn derive_app_id(predecessor_id: &str, derivation_path: &str) -> [u8; 32] {
    let input = format!("{APP_ID_DERIVATION_PREFIX}{predecessor_id},{derivation_path}");
    Sha3_256::digest(input.as_bytes()).into()
}

/// `H(pk || app_id)` with RFC 9380 `BLS12381G1_XMD:SHA-256_SSWU_RO_` and the NEAR DST.
pub fn hash_point(pk_compressed: &[u8; 96], app_id: &[u8; 32]) -> Result<G1Affine, Error> {
    let hasher = MapToCurveBasedHasher::<G1Projective, DefaultFieldHasher<Sha256, 128>, WBMap<g1::Config>>::new(
        NEAR_CKD_DOMAIN,
    )
    .map_err(|_| Error::HashToCurve)?;
    let input = [pk_compressed.as_slice(), app_id.as_slice()].concat();
    hasher.hash(&input).map_err(|_| Error::HashToCurve)
}

pub fn g1_from_bytes(bytes: &[u8]) -> Result<G1Affine, Error> {
    G1Affine::deserialize_compressed(bytes).map_err(|_| Error::BadPoint("G1"))
}

pub fn g2_from_bytes(bytes: &[u8]) -> Result<G2Affine, Error> {
    G2Affine::deserialize_compressed(bytes).map_err(|_| Error::BadPoint("G2"))
}

pub fn g1_to_bytes(p: &G1Affine) -> [u8; 48] {
    let mut out = [0u8; 48];
    p.serialize_compressed(&mut out[..]).expect("48-byte G1 encoding");
    out
}

pub fn g2_to_bytes(p: &G2Affine) -> [u8; 96] {
    let mut out = [0u8; 96];
    p.serialize_compressed(&mut out[..]).expect("96-byte G2 encoding");
    out
}

/// Parses NEAR's `bls12381g1:<base58>` / `bls12381g2:<base58>` string encodings.
pub fn parse_near_bls(s: &str, expect_prefix: &str, len: usize) -> Result<Vec<u8>, Error> {
    let (prefix, data) = s.split_once(':').ok_or(Error::BadEncoding("missing key prefix"))?;
    if prefix != expect_prefix {
        return Err(Error::BadEncoding("unexpected key prefix"));
    }
    let bytes = bs58::decode(data).into_vec().map_err(|_| Error::BadEncoding("bad base58"))?;
    if bytes.len() != len {
        return Err(Error::BadEncoding("bad key length"));
    }
    Ok(bytes)
}

pub fn near_bls_string(prefix: &str, bytes: &[u8]) -> String {
    format!("{prefix}:{}", bs58::encode(bytes).into_string())
}

/// Compressed encodings of the group identities, as accepted by the MPC contract's
/// `AppPublicKeyPV` for an intentionally public release.
pub fn g1_identity_bytes() -> [u8; 48] {
    g1_to_bytes(&G1Affine::zero())
}

pub fn g2_identity_bytes() -> [u8; 96] {
    g2_to_bytes(&G2Affine::zero())
}

/// Verifies a released CKD value: `e(sig, g2) == e(H(pk || app_id), pk)`.
pub fn verify_release(pk_compressed: &[u8; 96], app_id: &[u8; 32], sig: &G1Affine) -> Result<bool, Error> {
    let pk = g2_from_bytes(pk_compressed)?;
    let q = hash_point(pk_compressed, app_id)?;
    if sig.is_zero() {
        return Ok(false);
    }
    let lhs = Bls12_381::pairing(*sig, G2Affine::generator());
    let rhs = Bls12_381::pairing(q, pk);
    Ok(lhs == rhs)
}

/// For an `AppPublicKeyPV{pk1: A1, pk2: A2}` request with secret `a`, the MPC returns
/// `(Y, C = sig + a*Y)`; `a = 0` (identity key) gives `C = sig`.
pub fn unmask_response(big_y: &G1Affine, big_c: &G1Affine, a: &Fr) -> G1Affine {
    (big_c.into_group() - big_y.into_group() * a).into()
}
