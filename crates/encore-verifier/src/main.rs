//! OutLayer entry point: JSON input on stdin, secrets as env vars, exactly one JSON value on stdout.
use std::io::Read;

use encore_verifier::{run, Input, Output, Secret, VERIFIER_ID};

fn secret_from_env() -> Option<Result<Secret, String>> {
    let (k, r) = (std::env::var("ENCORE_K").ok()?, std::env::var("ENCORE_R").ok()?);
    let parse = |s: &str| -> Result<[u8; 32], String> {
        hex::decode(s.trim()).ok().and_then(|v| v.try_into().ok()).ok_or_else(|| "secret is not 32-byte hex".to_string())
    };
    Some(parse(&k).and_then(|k| parse(&r).map(|r| Secret { k, r })))
}

fn failure(msg: String) -> Output {
    Output {
        verifier: VERIFIER_ID.to_string(),
        mode: "none".into(),
        game: String::new(),
        epoch: 0,
        pkg_sha256: String::new(),
        sealed_key_sha256: String::new(),
        root: String::new(),
        core_sha256: String::new(),
        seed: String::new(),
        checks: Default::default(),
        sampled: 0,
        trades_applied: 0,
        transcript_sha256: None,
        pass: false,
        error: Some(msg),
    }
}

fn main() {
    let mut raw = String::new();
    let output = match std::io::stdin().read_to_string(&mut raw) {
        Err(e) => failure(format!("stdin: {e}")),
        Ok(_) => match serde_json::from_str::<Input>(&raw) {
            Err(e) => failure(format!("input json: {e}")),
            Ok(input) => match secret_from_env() {
                Some(Ok(secret)) => run(&input, Some(&secret)),
                Some(Err(e)) => failure(e),
                None if input.released_sig.is_some() => run(&input, None),
                None => failure("no secret row opened and no released_sig given".into()),
            },
        },
    };
    println!("{}", serde_json::to_string(&output).expect("output json"));
}
