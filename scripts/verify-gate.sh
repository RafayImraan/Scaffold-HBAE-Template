#!/usr/bin/env bash
# verify-gate.sh — runs all quality gates for hedera-committee
# Usage: ./scripts/verify-gate.sh
# Exits non-zero if any gate fails

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== hedera-committee verify-gate ==="

# 1. lint (both workspaces, zero warnings)
echo "1/6: lint"
npm run lint -- --max-warnings=0

# 2. next:check-types
echo "2/6: next:check-types"
npm run next:check-types

# 3. hardhat:check-types
echo "3/6: hardhat:check-types"
npm run hardhat:check-types

# 4. next:build
echo "4/6: next:build"
npm run next:build

# 5. hardhat:compile
echo "5/6: hardhat:compile"
npm run hardhat:compile

# 6. hardhat:test (44 passing)
echo "6/6: hardhat:test"
npm run hardhat:test

echo "=== ALL GATES PASSED ==="