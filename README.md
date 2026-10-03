# hedera-committee — USD-denominated ROSCA on Hedera

A digital ROSCA (rotating savings and credit association) — `maxMembers` people each contribute a fixed USD amount every `roundDuration`; each round the pot goes to the next member in join order. Chainlink HBAR/USD oracle (load-bearing), HSS-scheduled payouts, HCS audit log.

## What's in this template

- **CommitteeFactory** + **Committee** contracts: create on-chain ROSCAs with USD-denominated rounds
- **ChainlinkHbarUsdAdapter**: HBAR/USD oracle (load-bearing, Chainlink on testnet/mainnet, mock locally)
- **HSS integration**: `finalizeRound` scheduled via Hedera Schedule Service (`0x16b`); manual fallback always available
- **HCS audit log**: server-verified receipts → topic `0.0.10809816` (testnet)
- **Unit conversion**: `unitsPerHbar = 1e8` on Hedera (tinybars), `1e18` locally (wei); `relayScale = 1e18 / unitsPerHbar`
- Next.js App Router: home (create/list), committee detail (join/contribute/finalize, members, payouts, audit trail)
- Hardhat tests: 44 passing, both unit regimes (Hedera tinybars / local wei)

## Quick start

```bash
npm install

# Terminal 1: local Hedera-forked node
npm run hardhat:chain --

# Terminal 2: deploy to that node (8545)
npm run hardhat:deploy -- --network localhost

# Terminal 3: Next.js app
npm run next:start --
```

Open [http://localhost:3000](http://localhost:3000).

Frontend only (no local chain):
```bash
npm install
npm run next:dev --
```

## Limitations

1. **A member who already received the pot can stop contributing** — no collateral enforces future rounds.
2. Oracle price staleness is bounded per-committee (`maxPriceAge`); stale quotes revert contributions.
3. HSS capacity is not guaranteed — if `hasScheduleCapacity` fails, `PayoutScheduleFailed` is emitted and manual `finalizeRound()` is the fallback.
4. Reserve (0.5 HBAR) covers HSS fees; if drained, scheduled payouts may fail until `topUpReserve()`.
5. No on-chain slashing or reputation — social/legal enforcement is out of scope.

## Units

- **Hedera (testnet/mainnet, chainId 295/296)**: native unit = tinybars (1 HBAR = 1e8). `unitsPerHbar = 1e8`, `relayScale = 1e10`.
- **Local Hardhat / fork**: native unit = wei (1 HBAR = 1e18). `unitsPerHbar = 1e18`, `relayScale = 1`.
- **Contract invariant**: `unitsPerHbar * relayScale = 1e18` in both regimes.
- **Frontend tx value** = `requiredNative * relayScale` (validated by `packages/nextjs/utils/hbarUnits.ts` tests).
- All amounts in contract storage (`pot`, `required`, payouts) are in chain-native units.

## Hashscan links (testnet)

| Item | Link |
|------|------|
| ChainlinkHbarUsdAdapter | https://hashscan.io/testnet/contract/0x2545c7d156045158C081A09F157da44DcD322d23 |
| CommitteeFactory (v2, hssEnabled) | https://hashscan.io/testnet/contract/0x56CCC11aaC8d028D0c7a0E9F7F954C797E9DaDC2 |
| HCS topic | https://hashscan.io/testnet/topic/0.0.10809816 |

Example committee lifecycle (most recent run):
| Action | Hashscan |
|--------|----------|
| Create committee | https://hashscan.io/testnet/tx/0x42ef5718e402814399a09067b87a0c585812ab3f2c7433fb710e291d9c884514 |
| Join (member1) | https://hashscan.io/testnet/tx/0xcc1030333774cc0c07246f5adce120293e4b2e0ef68922e210f5ca5fdacc564b |
| Join (member2) — HSS scheduled | https://hashscan.io/testnet/tx/0x616ffa03a9758b2daf91376292f66e90772dab79ba2fb95cfb6f8afc9d53f0bd |
| Contribute (member1) | https://hashscan.io/testnet/tx/0xe9ed21b47cd0580c22b659e3a99f34826403265f284146c58de6403192493a3b |
| HCS records | topic seq 15–19 |

## Project layout

- **packages/hardhat** — Contracts (`Committee`, `CommitteeFactory`, oracles, mocks), deploy scripts, 44 tests
- **packages/nextjs** — Next.js app (App Router), HCS route, UI components
- **docs/** — `PLAN.md`, `RESEARCH.md` (evidence, probe data)

## Quality gates

```bash
npm run lint -- --max-warnings=0
npm run next:check-types
npm run hardhat:check-types --
npm run next:build
npm run hardhat:compile
npm run hardhat:test --
./scripts/verify-gate.sh
```

## Deploy to testnet

```bash
# Deploy contracts
cd packages/hardhat && npx hardhat deploy --network hederaTestnet

# Create HCS topic (idempotent)
npm run hcs:topic --

# Start app for HCS relay
npm run next:serve --

# Run demo (6-min round)
npm run hardhat:demo:testnet --
```

## License

MIT