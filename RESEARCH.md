# RESEARCH — Phase 0 findings (hedera-committee)

Date: 2026-10-01. Every address, ABI, endpoint and manifest field below was checked
against official docs, the official `scaffold-hbar` / `create-scaffold-hbar` repos, or a
live network call. Nothing here is from memory. Items marked **UNVERIFIED** are called out
explicitly.

---

## 1. BRIEF.md in 10 lines (eligibility gate + rubric)

1. Ship **one public MIT repo** that scaffolds with `npm create scaffold-hbar@latest -- --template <org>/<repo>` — no PR into scaffold-hbar needed.
2. **Gate (pass/fail, all required):** scaffolds cleanly; `template.json` present and valid; `README.md` + `AGENTS.md` present; install/lint/build clean from a fresh scaffold; app boots and core routes return OK; one Hedera service in play with a verifiable testnet tx (mirror node/Hashscan link); no committed secrets / no `.env`; MIT licence, original work; harness spec only if the harness was used.
3. **Rubric /100:** ecosystem integration **35** (must be *load-bearing* — removing it breaks the template), docs **30**, code quality **20**, Hedera service depth **15**.
4. Stack is fixed: Next.js + Hardhat or Foundry, npm or Yarn workspaces, Node ≥ 20.18.3, monorepo with `packages/`.
5. Build window: Sept 21 – **Oct 4, 2026**; judging Oct 5–16; 5 × $2,000 prizes, gate-clearing templates get a docs listing either way.
6. Oracles, DEXes, bridges, lending, storage all count as integration; a protocol with thin/no testnet presence may be used **read-only or forked-mainnet** and must be documented.
7. Docs are worth 30 — README must take a stranger from scaffold → running app → understanding the pattern with zero help.
8. Code quality = idiomatic, sensibly structured monorepo, meaningful tests, errors handled, **no dead code or AI slop**.
9. Hedera depth = multiple services composed or one used with real depth (not a single token transfer).
10. Two Hedera-specific warnings: **do not put smart-contract calls inside Atomic Batch transactions** (6-month deprecation from Sept 22, 2026, removal planned March 2027), and **HCS is not a database** — pair it with an index/DB for queries.

---

## 2. scaffold-hbar conventions (verified from source)

Sources cloned locally:
- `github.com/hedera-dev/scaffold-hbar` (templates repo, branches `templates/*`)
- `github.com/hedera-dev/create-scaffold-hbar` (the CLI, v0.4.0)
- Docs: https://docs.hedera.com/solutions/tools/scaffold-hbar

### 2.1 How an external template is consumed

- `npm create scaffold-hbar@latest -- --template <owner>/<repo>[#branch]` → the CLI calls
  `giget` with `gh:<owner>/<repo>[#branch]` (default branch if no `#ref`).
- Before download, the CLI fetches `<repo>/template.json` from the GitHub contents API to
  derive prompt capabilities; on any failure it silently falls back to permissive defaults
  (`frontend: [nextjs-app, none]`, `solidityFramework: [foundry, hardhat, none]`,
  `packageManager: [yarn, npm]`). So an invalid `template.json` does not break scaffolding
  *at prompt time*, but it **does** break at the end: `processTemplateManifest()` runs
  `TemplateManifestSchema.parse()` (zod) on the copied file and **throws on invalid shape**.
- After copy the CLI: removes the unselected framework package (`packages/foundry` or
  `packages/hardhat`), removes `packages/nextjs` if `frontend=none`, rewrites root
  `package.json` workspaces/scripts, converts yarn→npm text across the tree when npm was
  chosen, removes yarn-only files (`.yarnrc.yml`, `.yarn`, `yarn.lock`, `.husky`) for npm,
  strips husky scripts, processes `template.json` (then **deletes it**), runs `git init -b main`,
  installs deps, runs `npm run format --` / `npm run format` (non-fatal on failure), and finally
  creates the first git commit.
- Practical consequences for this repo:
  - Root scripts **must** use the `npm run workspace -- @sh/<pkg> …` form — the npm rewrite regex is
    literally `npm run workspace -- (@sh/\w+) (\S+) → npm run $2 -w $1 --`. Keep the `@sh/` scope.
  - Root `format` script must exist and succeed after install (it runs during scaffold).
  - `template.json` must be **strictly valid** against the zod schema below.

### 2.2 `template.json` shape (zod schema, exact)

```jsonc
{
  "name": "hedera-committee",           // required, min 1
  "description": "…",                   // optional
  "version": "1.0.0",                   // optional
  "create-scaffold-hbar": {             // optional block
    "rename": { "PLACEHOLDER": { "to": "…", "paths": ["dir"] } },  // optional
    "instructions": ["…"],              // optional (legacy)
    "requirements": { "node": ">=20.18.3" },   // optional
    "envVars": [{ "key": "K", "description": "…" }],  // optional; writes root .env.example
    "capabilities": {                   // optional
      "frontend": ["nextjs-app"],                  // enum: nextjs-app | none
      "solidityFramework": ["hardhat"],            // enum: hardhat | foundry | none
      "packageManager": ["yarn", "npm"]            // enum: yarn | npm | none
    },
    "defaults": { "frontend": "nextjs-app", "solidityFramework": "hardhat", "packageManager": "yarn" },
    "outro": {                          // optional; printed after scaffold
      "sections": [{ "title": "…", "steps": [
        { "label": "…", "command": "{run:hardhat:deploy}" },   // placeholders resolved by CLI
        { "label": "…", "url": "https://…" },
        { "text": "… {pm} …" }
      ]}],
      "installCommand": "npm install"  // optional
    }
  }
}
```

- Built-in templates also ship `name` + `description` at top level (e.g. `blank`,
  `payments-scheduler`, `cross-chain-dca`) — mirror that.
- Outro command placeholders: `{run:<script>}`, `{run:framework:<script>}`,
  `{run:<pm-prefix>:<script>}` (built-ins use e.g. `{run:hardhat:account:generate}`,
  `{run:next:dev}`), `{url:…}`/`url`, `{pm}` in text.
- Because capabilities are read from GitHub before scaffolding, declaring
  `solidityFramework: ["hardhat"]` hides the Foundry prompt → only Hardhat gets installed.

### 2.3 Monorepo conventions (from `templates/blank-template` and `templates/cross-chain-dca`)

| Item | Convention |
| --- | --- |
| Root `package.json` | `"name": "sh"`, workspaces `packages/hardhat`, `packages/nextjs`, `"packageManager": "yarn@3.2.3"`, `engines.node >=20.18.3`, scripts `next:*` / `hardhat:*` delegating via `npm run workspace -- @sh/<pkg>` |
| Yarn | Yarn 3 (berry) with `nodeLinker: node-modules`, committed `.yarn/releases/yarn-3.2.3.cjs`, two plugins, `nmHoistingLimits: workspaces` |
| Husky / lint-staged | `.husky/pre-commit` → `npm run lint-staged -- --verbose`; `.lintstagedrc.js` runs `next:lint --fix --file …` + `next:check-types` + `hardhat:lint-staged --fix` |
| CI | `.github/workflows/lint.yaml`: npm install, local chain + deploy, `next:lint --max-warnings=0`, `next:check-types`, `hardhat:lint --max-warnings=0` |
| Hardhat package | `@sh/hardhat`; hardhat 2.22.19 + hardhat-deploy + typechain + ethers v6 + chai matchers + solidity-coverage + hardhat-gas-reporter; solidity 0.8.28, optimizer 200 runs; networks `hardhat` (forked from `HEDERA_RPC_URL`, chainId 296), `hederaTestnet` 296, `hederaMainnet` 295; Sourcify verify enabled, etherscan disabled; `deploy/*.ts` scripts; deploy task extended to run `scripts/generateTsAbis.ts` which writes `packages/nextjs/contracts/deployedContracts.ts` |
| Deployer key | Encrypted keystore at runtime (`DEPLOYER_PRIVATE_KEY_ENCRYPTED`), plaintext only via `__RUNTIME_DEPLOYER_PRIVATE_KEY` env; `npm run hardhat:account:generate --|import|reveal-pk` |
| Next.js package | `@sh/nextjs`; App Router, RainbowKit 2.2.9, wagmi 2.19.5, viem 2.39.0, TanStack Query, DaisyUI 5, Tailwind 4, `@scaffold-hbar-ui/{components,debug-contracts,hooks}`, `@hiero-ledger/sdk` (already a dependency in `cross-chain-dca`), `~~/` import alias |
| Scaffold hooks | `useScaffoldReadContract`, `useScaffoldWriteContract`, `useScaffoldEventHistory`, `useScaffoldWatchContractEvent`, `useScaffoldContract`, `useDeployedContractInfo`, `useTransactor`, `useTargetNetwork` (names matter — see `AGENTS.md` in blank) |
| Networks | `scaffold.config.ts` targets `chains.hederaTestnet` / `chains.hedera` + local fork; RPC overrides `https://testnet.hashio.io/api`, `https://mainnet.hashio.io/api`; native currency decimals kept at 18 with an explicit comment about tinybars |
| Explorer links | `getBlockExplorerAddressLink` uses `/account/…` (not `/address/…`) for Hedera chains; tx links `https://hashscan.io/<network>/tx/<hash>` |
| Licence file | Upstream ships a file literally named `LICENCE` (MIT, hedera-dev + BuidlGuidl copyright) |
| Docs | Short, scannable README (78 lines) + AGENTS.md (138 lines) with commands/layout/style tables |

**Decision:** base this template on `templates/blank-template` (Hardhat + Next.js only), strip
`packages/foundry`, and keep every convention above so reviewers see an idiomatic template.

---

## 3. Oracle: HBAR/USD on Hedera testnet

### 3.1 Primary: Chainlink Data Feed — **exists on testnet and is live**

| Network | Feed contract | Verified how |
| --- | --- | --- |
| Hedera **testnet** (chain 296) | `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` | `eth_call` against `https://testnet.hashio.io/api` |
| Hedera **mainnet** (chain 295) | `0xAF685FB45C12b92b5054ccb9313e135525F9b5d5` | `eth_call` against `https://mainnet.hashio.io/api` |

Live read evidence (testnet proxy, `AggregatorV3Interface`):

- `description()` → `HBAR / USD`
- `decimals()` → `8`
- `latestRoundData()` → `answer = 10828473` (⇒ **$0.10828473 / HBAR**), `updatedAt = 1790802465`,
  `roundId == answeredInRound`, update age observed at 88 s, then 946 s, then 1006 s
  (⇒ the reporter updates, but with multi-minute gaps; heartbeat not measured exactly).

Source of the addresses: the official scaffold-hbar `templates/oracles` branch
(`packages/foundry/script/HelperConfig.s.sol`), which cites
`docs.chain.link/data-feeds/price-feeds/addresses?network=hedera`. Independently confirmed that
Chainlink publishes an HBAR/USD feed page for Hedera (`data.chain.link/feeds/hedera/hedera/hbar-usd`).
`data.chain.link` returned HTTP 429 to this machine, so the *page* could not be scraped — the
on-chain contract call above is the stronger evidence anyway.

Reading pattern (verified against the official `ChainlinkPriceOracleAdapter` in
`scaffold-hbar templates/oracles`):

```solidity
(uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
if (answeredInRound < roundId || updatedAt == 0) revert IncompleteRound();
if (answer <= 0)                                    revert InvalidPrice();
if (block.timestamp - updatedAt > maxPriceAge)      revert StalePrice(updatedAt, maxPriceAge);
// normalize feed.decimals() (8) to 18 decimals → priceE18
```

- **No confidence interval** exists on Chainlink push feeds — staleness + round completeness +
  positive answer are the available checks (Pyth has confidence, Chainlink does not).
- Recommended `maxPriceAge`: make it a constructor/creation parameter. Chainlink HBAR/USD has a
  ≤1 h heartbeat on mainnet (**UNVERIFIED** exact number — `data.chain.link` rate-limited us);
  testnet reporter cadence observed ≥17 min between updates in one window. Testnet deploy should
  use a looser bound (4–12 h) than production (≤1 h).

### 3.2 Alternatives (documented, not required)

- **Pyth** HBAR/USD price id verified live from `hermes.pyth.network/v2/price_feeds?query=HBAR`:
  `0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd` — matches the constant in the
  official `templates/oracles` branch (Pyth contract `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` on
  both networks). Pyth is a **pull** oracle: Hermes update data must be pushed on-chain before each
  read, which does not fit a `contribute()` UX as cleanly as Chainlink push.
- **Supra** push oracle `0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917` (testnet), HBAR/USDT pair id 75 —
  per official `templates/oracles` HelperConfig (**UNVERIFIED** directly by us; Supra's site was not
  queried).
- **Hedera exchange-rate system contract `0x168`** (`tinycentsToTinybars`, HIP-475) gives the
  network's own HBAR/USD rate. Official guidance: it is *not* a live price oracle (it exists to price
  fees), so it must not be the USD oracle for contributions. Good README material for "why not this".

### 3.3 Decimals (must be handled explicitly)

- Chainlink HBAR/USD: **8 decimals** (verified).
- HBAR on HAPI/tinybars: **8 decimals** (1 HBAR = 1e8 tinybars).
- HBAR through JSON-RPC (`msg.value`, balances, gas price): **18 decimals/wei** — explicitly
  documented in scaffold-hbar's own `scaffold.config.ts` comment.
- Conversion used by the contract (see PLAN): `requiredWei = ceil(usdAmountE6 * 1e30 / priceE18)`
  where `usdAmountE6` is USD × 1e6 and `priceE18` is USD-per-HBAR × 1e18; the adapter normalizes the
  feed's 8 decimals → 18 (`AssetConversionLib`-style `answer * 10^(18-8)`).

### 3.4 Fallback for local development

There is **no oracle on the in-process Hardhat network**. Local runs use a `MockPriceOracle`
deployed by the local deploy script (seed price = 0.10 USD/HBAR, settable, with age control so the
staleness path is testable). This is a test/dev mock, not an ecosystem claim, and is documented in
the README. **No forked-mainnet or read-only fallback is needed** because a real testnet feed exists.

---

## 4. Hedera Schedule Service (HSS) from Solidity

Verified: https://docs.hedera.com/evm/hedera-services/system-contracts/schedule-service and
HIP-1215 (`github.com/hashgraph/hedera-improvement-proposal/HIP/hip-1215.md`, status: Final,
release v0.68.0).

- **System contract address: `0x000000000000000000000000000000000000016B` (`0x16b`).**
- Relevant functions (selector — signature):

| Selector | Signature | HIP |
| --- | --- | --- |
| `0x6f5bfde8` | `scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes callData) returns (int64, address)` | 1215 |
| `0xe6599c18` | `scheduleCallWithPayer(address to, address payer, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes callData) returns (int64, address)` | 1215 |
| `0x105772b2` | `executeCallOnPayerSignature(...) returns (int64, address)` | 1215 |
| `0x72d42394` | `deleteSchedule(address) returns (int64)` | 1215 |
| `0xc61dea85` | `deleteSchedule() returns (int64)` (redirect at schedule address) | 1215 |
| `0xdfb4a999` | `hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) view returns (bool)` | 1215 |
| `0xf0637961` | `authorizeSchedule(address) returns (int64)` | 755 |

- Semantics that matter for us:
  - `scheduleCall` with **the calling contract as payer**; the network executes `callData` against
    `to` automatically at/after `expirySecond`. Contract-to-contract, no off-chain signer needed
    (this is exactly what the built-in `payments-scheduler` and `cross-chain-dca` templates rely on).
  - **Never reverts.** On failure returns `(failureCode, address(0))`; on success `(22, scheduleAddr)`.
    Always check both. `22 == HederaResponseCodes.SUCCESS`.
  - `expirySecond` must be **strictly after** current consensus time (also prevents self-loop attacks).
  - Capacity/throttling: probe `hasScheduleCapacity(expiry, gasLimit)` first; HIP-1215 documents a
    `findAvailableSecond()` retry pattern (exponential backoff + jitter).
  - Costs: HAPI `ScheduleCreate` fee **+20 % markup** for system-contract usage; gas/storage/consensus
    fees included; expired schedules cost nothing extra.
  - HSS is **not available on a local Hardhat/forked network** — official `payments-scheduler`
    template explicitly says "run it on Hedera testnet or mainnet". Therefore the schedule service
    address must be **injected** (real `0x16b` on Hedera networks, `MockScheduleService` locally).
- Verified usage pattern from the official `templates/payments-scheduler` `ScheduledVault.sol`
  (constants, capacity probe, response check, `deleteSchedule` for cancel).

**Architecture note:** HSS fee payer is the *contract*, so a committee contract must keep a small
HBAR **gas reserve separate from the pot** (members' money). Otherwise scheduled execution would
drain user funds. (See PLAN.)

---

## 5. HCS — architecture decision

- **Solidity cannot call HCS.** Confirmed: HCS has no system-contract address (system contracts are
  only HTS `0x167`, exchange rate `0x168`, PRNG `0x169`, HAS `0x16a`, HSS `0x16b` —
  https://docs.hedera.com/evm/hedera-services/system-contracts).
- Decision (as directed): **Next.js App Router server route** (`app/api/hcs/submit/route.ts`) uses
  the official Hedera JS SDK to append audit records after contract actions. The operator key lives
  in a server-only env var (`HEDERA_OPERATOR_KEY`, never `NEXT_PUBLIC_*`), the client POSTs a small
  JSON record, the server validates it and submits `TopicMessageSubmitTransaction`.
- SDK: **`@hiero-ledger/sdk`** (current namespace; `@hashgraph/sdk` still works but docs say prefer
  `@hiero-ledger`). API: `Client.forOperator({ accountId, privateKey })` + `new TopicCreateTransaction()`
  / `new TopicMessageSubmitTransaction().setTopicId().setMessage()` → `.execute(client)` → receipt.
  (`@hiero-ledger/sdk` is already in the official `cross-chain-dca` template's nextjs deps.)
- Topic: created by the deploy script with **`submitKey` = operator public key** so only the server
  route can append; topic id stored in `.env` (`HCS_TOPIC_ID`).
- Message limit: **1 KiB per message** (docs) — payload is JSON, size-checked server-side.
- **Read path (verified live):** mirror node REST
  `GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages?limit=N` returns
  `sequence_number`, `consensus_timestamp`, base64 `message`, `topic_id`, `running_hash`.
  Verified against a real testnet topic (`0.0.9153818`, HTTP 200). The unfiltered
  `GET /api/v1/topics?limit=1` returned 404 from this machine — we only need the per-topic
  endpoint, which works.
- Contract **events** are read directly through the JSON-RPC relay (wagmi
  `useScaffoldEventHistory`) and can also be read via mirror node
  `GET /api/v1/contracts/{evmAddress}/results/logs` (verified HTTP 200).
- HCS is an **append-only audit log, never a database** (BRIEF §11): the UI's "audit trail" tab is
  the only consumer; all authoritative state comes from the contract + events.

---

## 6. Networking / explorer facts

| Item | Value | Verified |
| --- | --- | --- |
| Hedera testnet JSON-RPC | `https://testnet.hashio.io/api` | live `eth_call`s above |
| Hedera mainnet JSON-RPC | `https://mainnet.hashio.io/api` | live `eth_call` |
| Mirror node REST (testnet) | `https://testnet.mirrornode.hedera.com/api/v1/…` | live 200s |
| Chain IDs | 296 testnet, 295 mainnet | scaffold-hbar config + docs |
| Hashscan URL shapes | `https://hashscan.io/testnet/contract/0x…`, `/tx/<accountId>@<validStart>.<nonce>`, `/account/0.0.x`, `/topic/0.0.x` | pattern taken from scaffold-hbar's own `hardhat.config.ts` verify hook and `networks.ts`; the site returned 404 to non-browser clients from this machine (bot filtering), root `hashscan.io` → 200 |
| Faucet | https://portal.hedera.com/faucet | per docs |
| Sourcify | Hedera testnet/mainnet verify through sourcify.dev (no custom verifier URL) | scaffold-hbar `hardhat.config.ts` comment + Hedera blog |

---

## 7. Rules applied to this build

- No Atomic Batch transactions anywhere (deprecation notice, Sept 22 2026).
- No HCS-from-Solidity attempts; HCS only via server route.
- Every address used in code appears in the table above with its verification method.
- The oracle is load-bearing: `contribute()` cannot compute the USD→HBAR amount without it.

## 8. Open questions (blocking, for the user)

1. **GitHub owner/repo** for the template (needed verbatim in the README's one-command line and for
   the gate self-audit which scaffolds from the pushed repo): e.g. `<your-org>/hedera-committee`.
2. **Funded Hedera testnet account** (ECDSA private key + account id) in a local `.env` — needed in
   Phase 2 for the testnet deploy/demo transactions and the Hashscan evidence link. Never committed,
   never logged.
