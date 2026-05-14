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
