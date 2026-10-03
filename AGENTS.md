# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a **hedera-committee** dApp: Next.js App Router, wallet connect, USD-denominated ROSCA (Committee/CommitteeFactory), Chainlink HBAR/USD oracle, HSS scheduled payouts, HCS audit log. Hardhat only (no Foundry).

Use the package manager this project was created with (`packageManager` in the root `package.json`, or the lockfile). Examples use `yarn`; if the app was created with npm, swap `yarn <script>` for `npm run <script>`.

## Which Solidity package

- `packages/hardhat` exists → Hardhat (`hardhat-deploy`)
- `packages/nextjs` is always the frontend (App Router, RainbowKit, Wagmi, Viem, DaisyUI)

Follow only the flavor that is present.

## Commands

Package-prefixed scripts for package-specific work. Keep only truly cross-workspace commands unprefixed.

```bash
# Local chain + deploy + frontend (separate terminals)
npm run hardhat:chain --    # Hedera-forked Hardhat node on 8545
npm run hardhat:deploy -- --network localhost
npm run next:start --       # http://localhost:3000

# Frontend only
npm run next:dev --

# Quality / build
npm run lint --
npm run format --
npm run next:build --
npm run hardhat:compile --

# Live networks
npm run hardhat:deploy -- --network hederaTestnet   # or hederaMainnet
npm run hardhat:verify:testnet --
npm run hardhat:verify:mainnet --

# HCS topic (idempotent)
npm run hcs:topic --

# Demo (testnet, 6-min round)
npm run next:serve --       # must run for HCS relay
npm run hardhat:demo:testnet --

# Deployer account
npm run hardhat:account:generate --
npm run hardhat:account:import --
npm run hardhat:account --
```

`npm run hardhat:deploy --` without `--network localhost` targets the in-process `hardhat` network, not the long-running fork.

## Layout

### Hardhat

- Contracts: `packages/hardhat/contracts/`
  - `Committee.sol` — ROSCA logic, HSS scheduling, HCS events
  - `CommitteeFactory.sol` — creates committees, passes `hssEnabled` flag
  - `oracle/ChainlinkHbarUsdAdapter.sol` — Chainlink HBAR/USD adapter
  - `oracle/MockPriceOracle.sol` — local testing oracle
  - `mocks/MockScheduleService.sol` — local HSS mock
  - `interfaces/IHederaScheduleService.sol`, `IPriceOracle.sol`, `IAggregatorV3.sol`
- Deploy scripts: `packages/hardhat/deploy/`
  - `00_deploy_oracle.ts`, `01_deploy_schedule_mock.ts`, `02_deploy_factory.ts`
- Tests: `packages/hardhat/test/`
  - 44 passing, both `unitsPerHbar` regimes (tinybars/wei)
- Config: `packages/hardhat/hardhat.config.ts`
- Tagged deploy: `npm run hardhat:deploy -- --tags CommitteeFactory`

### After deploy

ABIs and addresses are written to `packages/nextjs/contracts/deployedContracts.ts`. Put third-party contracts in `packages/nextjs/contracts/externalContracts.ts`.

Core contracts: `Committee`, `CommitteeFactory`, `ChainlinkHbarUsdAdapter`, `MockPriceOracle`, `MockScheduleService`.

## Frontend contract interaction

Hooks live in `packages/nextjs/hooks/scaffold-hbar`. Use the names that exist in the codebase:

- `useScaffoldReadContract` — not `useScaffoldContractRead`
- `useScaffoldWriteContract` — not `useScaffoldContractWrite`

Also: `useScaffoldWatchContractEvent`, `useScaffoldEventHistory`, `useDeployedContractInfo`, `useScaffoldContract`, `useTransactor`.

```typescript
const { data: balance } = useScaffoldReadContract({
  contractName: "HederaToken",
  functionName: "balanceOf",
  args: [connectedAddress],
});

const { writeContractAsync, isPending } = useScaffoldWriteContract({
  contractName: "HederaToken",
});

await writeContractAsync({
  functionName: "mint",
  args: [connectedAddress, parseEther("1")],
});
```

For committee instances (no deployment entry), use raw `useReadContracts` / `useWriteContract` with address from `deployedContracts.ts` or factory `getCommittees()`.

### UI

Use `@scaffold-hbar-ui/components` for web3 UI: `Address`, `Balance`, `HederaAddress`, `HederaPortalFaucet`, `BaseInput`, `HederaAddressInput`, `HbarInput`.

Use DaisyUI classes, not raw Tailwind when a DaisyUI component exists:

```tsx
<button className="btn btn-primary">Connect</button>
```

### Networks

- Hardhat: `packages/hardhat/hardhat.config.ts` (`hederaTestnet` 296, `hederaMainnet` 295)
- Next.js: `packages/nextjs/scaffold.config.ts` (target networks, polling, RPC overrides, WalletConnect)

## Style

| Style | Use |
| --- | --- |
| `UpperCamelCase` | types, components |
| `lowerCamelCase` | variables, functions |
| `CONSTANT_CASE` | constants |
| `snake_case` | Hardhat deploy files and Foundry scripts |

Next.js imports use the `~~` alias:

```tsx
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
```

App Router pages live under `packages/nextjs/app/`. Add `"use client"` when the page uses hooks.

Prefer `type` over `interface`. No `T` prefix on types. Let TypeScript infer when it can. Comments should add information.