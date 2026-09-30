# Scaffold-HBAR Template Bounty: Full Brief

Source: Hedera blog, "Scaffold-HBAR Template Bounty" (Jake Hall, Developer Relations Engineer, published September 16, 2026). Harness repo: github.com/hedera-dev/hedera-harness

This file is a complete, structured restatement of the official brief for use as the working source of truth. If anything here seems to conflict with the official page, the official page wins.

## 1. Goal

Build ONE public repository: a working scaffold-hbar template for a real Hedera use case. Any developer must be able to run a single command and have it running locally:

```
npm create scaffold-hbar@latest -- --template your-org/your-repo
```

Note the `--` before `--template`.

- scaffold-hbar ships with eight built-in templates today.
- This bounty adds community-authored external templates.
- External templates run from any public GitHub repo. There is no pull request into scaffold-hbar to merge and nothing to wait on.

## 2. Repository requirements

- Monorepo layout with separate `packages/` for contracts and frontend.
- `template.json` manifest declaring capabilities and defaults. Optional in the scaffold-hbar docs, REQUIRED for this bounty.
- `README.md` covering setup.
- `AGENTS.md` covering AI-assisted use.
- At least one Hedera service genuinely in play: HTS, HCS, HSS, or a Solidity contract on Hedera.
- One verifiable testnet transaction, evidenced by a mirror node or Hashscan link.
- Stack: Next.js with Hardhat or Foundry, npm or Yarn workspaces, Node 20.18.3 or later.
- MIT licence, original work, public repo.
- On-chain validation needs a funded testnet account. Get testnet HBAR from the Hedera Portal faucet.

## 3. Which integrations count (35 points)

Ecosystem integration is the largest single block in the rubric.

An integration scores well when it is load-bearing:
- The template does something a developer could not easily build alone.
- Removing the integration would break the point of the template.

It scores low when:
- An SDK is imported and called once just to tick a box.
- The app is self-contained with no ecosystem surface.

Example ecosystem integrations (illustrative, not a checklist):
- DEXes: SaucerSwap, Lambdaplex, SilkSuite
- Oracles: Chainlink, Supra, Pyth
- Bridges: Axelar, LayerZero, CCIP
- Lending protocols and decentralised storage

If a protocol has a thin or no Hedera testnet deployment, a read-only integration or a forked-mainnet integration is acceptable. Document the approach in the README. A missing testnet deployment is not a reason to abandon a good idea.

## 4. How it works

1. Register: tell the Hedera DevRel team who you are (about two minutes).
2. Join the AMA: walkthrough of gate requirements, rubric, Hedera Harness, and what a strong integration looks like, plus live questions.
3. Build during the two-week window, September 21 to October 4. Push to a public repo under an MIT licence.
4. Submit before October 4 closes. Submission contains:
   - Repo link
   - A Hashscan or mirror node link proving a testnet transaction
   - The dev-ex survey
   - Harness spec and validators, if the harness was used

## 5. Key dates

| Milestone | Date |
|---|---|
| Registration | Monday, September 14 |
| Building and submissions open | Monday, September 21 |
| AMA and office hours | Tuesday, September 29, 10:00 AM ET |
| Submissions close | Sunday, October 4, 11:59 PM ET |
| Judging | Monday, October 5 to Friday, October 16 |
| Winners announced | Monday, October 19 |

## 6. Eligibility gate (stage one, mechanical pass/fail, every item required)

Nothing reaches the panel until it passes. Run the npm create script before submitting.

- [ ] Scaffolds cleanly via `npm create scaffold-hbar@latest -- --template owner/repo`
- [ ] `template.json` manifest present and valid
- [ ] `README.md` and `AGENTS.md` present
- [ ] Install, lint and build pass clean from a fresh scaffold
- [ ] App boots and core routes return OK
- [ ] At least one Hedera service in play, with a verifiable testnet transaction and a mirror node or Hashscan link supplied
- [ ] No committed secrets and no committed `.env`
- [ ] MIT licence, original work
- [ ] Harness spec and validators submitted, if the harness was used

Every template that clears the gate is listed in the Hedera docs with credited authorship, whether or not it places.

## 7. Scoring (stage two, out of 100, by the Hedera DevRel panel)

| Criterion | Points | What scores well |
|---|---|---|
| Ecosystem integration and value | 35 | The integration is load-bearing. The template is only possible because of it, and a developer gains a capability they could not easily build alone. |
| Docs quality | 30 | A developer unfamiliar with the repo goes from scaffold to running app to understanding the pattern without help. Clear setup, prerequisites, env vars, architecture, and an AGENTS.md. |
| Code quality | 20 | Idiomatic, readable, sensibly structured monorepo. Meaningful tests. Errors handled. No dead code or AI slop. |
| Hedera service depth | 15 | Non-trivial use of native Hedera services. Multiple services composed, or one used with real depth, beats a single token transfer. |

## 8. Hedera Harness

- Gives an AI coding agent the context to write working Hedera code: service APIs, patterns, tiered validation.
- Strongly recommended, NOT required. Templates built without it are judged on exactly the same rubric.
- If used, submit the harness spec and validators alongside the repo.

## 9. Prizes

- $10,000 total pool, five equal prizes of $2,000, decided by the panel on the rubric above.
- Prizes go only to submissions that clear the gate. If three pass, three prizes are paid and the rest stays unallocated.
- Every template that passes the gate is added to the external templates docs listing with credited authorship, independent of prizes.
- Winners additionally get a showcase and blog feature.
- The template stays yours; the docs listing points at your repo and you continue to maintain it.

## 10. FAQ

- Who can enter? Anyone. No gating, no application review.
- Can teams enter? Yes. Register as a team and give the team size. One $2,000 award per winning submission.
- How many templates per person? Each is judged on its own. Focus usually scores better than volume, given the weight on docs quality.
- What counts as ecosystem integration? DEXes, oracles, bridges, lending and storage protocols. The list is illustrative. What matters is that it is load-bearing, not decorative.
- Protocol has no Hedera testnet deployment? Read-only or forked-mainnet integration is acceptable. Document it in the README.
- Must I use Hedera Harness? No.
- Must the use case be original? The code must be original work under MIT. The use case need not be unheard of. A well-built template for a common pattern beats a novel one nobody needs.

## 11. Related news from the same page (relevant to this build)

- September 22, 2026: smart contract calls submitted as inner transactions of an Atomic Batch Transaction enter a six-month deprecation period, with removal planned for March 2027. Do NOT put smart contract calls inside Atomic Batch transactions.
- September 8, 2026: HCS gives fair ordering, consensus timestamps and tamper-resistant history, but it is not a database. Pair it with an index or database for queries.
