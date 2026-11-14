//! The factory's rules, driven through its methods: what a studio may ask for, what the new escrow is given, and
//! that the directory lists only escrows that exist.

use encroe_factory::{Factory, Listing};
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseError};

fn me() -> AccountId {
    "encroe-dir.testnet".parse().unwrap()
}

fn at(predecessor: AccountId, deposit: NearToken) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(me()).predecessor_account_id(predecessor).attached_deposit(deposit).block_timestamp(7);
    testing_env!(c.build());
}

fn factory() -> Factory {
    at(accounts(0), NearToken::from_near(0));
    Factory::new(
        "v1.signer-prod.testnet".parse().unwrap(),
        "outlayer.testnet".parse().unwrap(),
        "https://example.test/verifier.wasm".into(),
        "9c0eb2e7a47e83c8feaa3d54780bf8848eb5ec13659d4e925b010e4faf756aad".into(),
        "tee-verifier-2026-07-22.testnet".parse().unwrap(),
        "worker.outlayer.testnet".parse().unwrap(),
    )
}

#[test]
fn a_studio_creates_an_escrow_and_it_is_listed_once_it_exists() {
    let mut f = factory();
    at(accounts(1), NearToken::from_near(5));
    let _ = f.create_escrow("embergate".into(), accounts(1), "Embergate".into(), 3600);
    let listing = Listing {
        escrow: "embergate.encroe-dir.testnet".parse().unwrap(),
        owner: accounts(1),
        game: "Embergate".into(),
        grace_s: 3600,
        created_ns: 7,
        created_by: accounts(1),
    };
    at(me(), NearToken::from_near(0));
    assert!(f.on_created(listing.clone(), NearToken::from_near(5), Ok(())));
    assert_eq!(f.list(None, None), vec![listing.clone()]);

    // A failed creation (the name was taken) is not listed; the deposit goes back.
    assert!(!f.on_created(listing, NearToken::from_near(5), Err(PromiseError::Failed)));
    assert_eq!(f.count(), 1);
}

#[test]
fn the_escrow_code_is_the_one_compiled_in() {
    let f = factory();
    let built = std::fs::read("../encroe-escrow/target/near/encroe_escrow.wasm").unwrap();
    let want = hex::encode(near_sdk::env::sha256(&built));
    assert_eq!(f.escrow_code_sha256(), want);
}

#[test]
#[should_panic(expected = "attach at least 5 NEAR")]
fn an_escrow_must_pay_for_its_storage() {
    let mut f = factory();
    at(accounts(1), NearToken::from_near(1));
    let _ = f.create_escrow("cheap".into(), accounts(1), "Cheap".into(), 3600);
}

#[test]
#[should_panic(expected = "name: 2 to 32")]
fn names_are_plain_subaccount_labels() {
    let mut f = factory();
    at(accounts(1), NearToken::from_near(5));
    let _ = f.create_escrow("Bad.Name".into(), accounts(1), "Bad".into(), 3600);
}

#[test]
#[should_panic(expected = "grace_s")]
fn a_grace_period_cannot_be_zero() {
    let mut f = factory();
    at(accounts(1), NearToken::from_near(5));
    let _ = f.create_escrow("instant".into(), accounts(1), "Instant".into(), 0);
}
