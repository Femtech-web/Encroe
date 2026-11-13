# Encroe: build and check everything offline (the site has its own: cd web && npm test).
#   make build         game cores (Embergate, the go/no-go core and its broken build), verifier (native +
#                      wasm32-wasip2), contract, CLI; copies Embergate's core into web/public/core
#   make test          offline: CKD vectors, IBE, rejection tests, native-vs-WASM determinism, the escrow
#                      contract's lifecycle, the Embergate core
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
