pub mod ckd;
pub mod game;
pub mod ibe;
pub mod package;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("hash-to-curve failed")]
    HashToCurve,
    #[error("invalid {0} point")]
    BadPoint(&'static str),
    #[error("bad encoding: {0}")]
    BadEncoding(&'static str),
    #[error("zero scalar")]
    ZeroScalar,
    #[error("AEAD failure (wrong key or tampered package)")]
    Aead,
}
