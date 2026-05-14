# Zivana Validation Monorepo

**Protocol stack validation for Zivana — proving that Cardano, Midnight, Identus, Orcfax, Fetch.ai, and Celo integrate correctly before building full primitives.**

This repository contains six standalone, runnable stubs. Each stub exercises a critical integration point in the Zivana protocol stack. They are designed to be claimed as contributor tasks and extended into production-grade components.

## Structure

| Directory | Task | Primitives Exercised |
|-----------|------|---------------------|
| `aiken-stub/` | VAL-001 — Aiken Distribution Validator | Distribution, Covenant |
| `midnight-threshold/` | VAL-002 — Midnight Proof-of-Threshold Circuit | Trust |
| `identus-setup/` | VAL-003 — Identus DID & Credential Issuance | Identity |
| `orcfax-schema/` | VAL-004 — Orcfax Revenue Event Fact Statement | Distribution, Intelligence |
| `fetch-agent/` | VAL-005 — Fetch.ai uAgent + ASI Cloud | Intelligence |
| `celo-minipay/` | VAL-006 — Celo MiniPay Stablecoin Simulation | Distribution |

## Quick Start

Each directory contains its own `README.md` with setup and testing instructions. Start there.

## License

MIT — see [LICENSE](LICENSE)

## Part of Zivana Labs

Built for Africans, open to the world.
