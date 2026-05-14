# Contributing to Zivana Validation Monorepo

Welcome. This repository validates the Zivana Protocol tech stack. You’ll help prove that Cardano, Midnight, Identus, Orcfax, Fetch.ai, and Celo integrate correctly before we build the full primitives.

## Code of Conduct

All contributors must follow the [Zivana Code of Conduct](https://github.com/zivana-labs/.github/blob/main/CODE_OF_CONDUCT.md). Be respectful. Be honest. Represent the protocol accurately.

## Branch Protection — Critical Rule

**`main` is protected. You cannot commit directly to `main`.**

Always:
- Branch from `develop`
- Work in a feature branch (e.g., `val-001/my-feature`)
- Open a Pull Request targeting `develop`
- Wait for review and approval before merging

Never open a PR directly to `main`. The core team merges `develop` into `main` after validation.

## How to Get Started

1. **Read the roadmap**  
   Understand the Phase 0 goal: [ROADMAP.md](https://github.com/zivana-labs/zivana-docs/blob/main/ROADMAP.md)

2. **Browse open tasks**  
   Visit the [Zivana Contributor Portal](https://zivana.network/contribute/dashboard/tasks) and pick from available open tasks for the tech stacks Validations.

3. **Claim a task**  
   Claim the task on the portal. You can hold up to two active claims.

4. **Clone the repository**  
   ```bash
   git clone https://github.com/zivana-labs/zivana-validation.git
   cd zivana-validation
   git checkout develop

5. **Create a feature branch**
   git checkout -b val-001/your-description
   
6. **Find your stub**
    Each task has a dedicated directory. For example, VAL-001 is in aiken-stub/. Read its README.md first.

7. **Write code, test, document**

    Follow the task acceptance criteria. Extend the stub, add tests, and update the README.

8. **Submit a Pull Request**
    Push your branch and open a PR against develop. 
    Include: A clear description of what you changed, Evidence (transaction hashes, screenshots, logs) as required by the task
    Any issues you encountered

9. **Request review**
    Tag a core team member for review. Address all feedback.

10. **Merge and celebrate**
    Once approved, your PR is merged into develop. The task will be marked complete on the portal.

## Repository Structure

zivana-validation/
├── aiken-stub/            VAL-001  Distribution, Covenant
├── midnight-threshold/    VAL-002  Trust
├── identus-setup/         VAL-003  Identity
├── orcfax-schema/         VAL-004  Distribution, Intelligence
├── fetch-agent/           VAL-005  Intelligence
├── celo-minipay/          VAL-006  Distribution
└── CONTRIBUTING.md


## Quality Standards

   Readme first: Every stub must have a clear, tested README.md that a new contributor can follow.

   Code clarity: Write for the next person. Use meaningful names. Comment only where intent is not obvious.

   Test coverage: All new logic must be exercised by tests. Task acceptance criteria include specific test requirements.

   No secrets: Never commit private keys, API keys, or .env files. Use .env.example if needed.

   Licence: All code is MIT — see LICENSE.

## After Phase 0

   Successful validation code will be migrated to the respective protocol repositories (zivana-core, zivana-midnight, etc.). Contributors       who complete validation tasks will have priority for Phase 1 primitive development.

   Thank you for building the trust layer for Africa’s informal economy.
   
---

This guide should be placed as `CONTRIBUTING.md` in the root of `zivana-validation`. It enforces the `develop` → `main` workflow, explains how to pick tasks, and sets clear quality bars. Once committed, link it from the monorepo’s `README.md` and from the contributor portal’s onboarding section.

Ready to go.
