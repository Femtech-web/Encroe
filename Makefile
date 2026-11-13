# Encore go/no-go experiments (results: GO_NO_GO.md).
#   make build         cores (normal + broken), verifier (native + wasm32-wasip2), contract, CLI
#   make test          offline: CKD vectors, IBE, rejection tests, native-vs-WASM determinism
#   make reproduce-e1  third-party check of the E1 release from public data (testnet RPC + FastFS)
#   make reproduce-e3  E3: released key + package + verifier by hash vs the OutLayer-attested run
# The live E2 steps (they send testnet transactions) are scripts/testnet/e2.sh.

SHELL := /bin/bash
.PHONY: build test reproduce-e1 reproduce-e3

build:
	bash scripts/build/all.sh

test:
	bash scripts/test/offline.sh

reproduce-e1: build
	bash scripts/reproduce/e1.sh

reproduce-e3: build
	bash scripts/reproduce/e3.sh
