#!/usr/bin/env bash
# Brings up a local Payeer: an anvil chain, a mock USDC, both contracts, and two pacts — one
# already settled with winnings waiting, one still being decided. Arc's USDC calls native
# precompiles that can't run off-chain, so local work uses the mock the unit tests use.
#
#   ./scripts/local.sh          # prints the dev command to run next
#   ./scripts/local.sh --dev    # and starts the dev server itself
set -euo pipefail

RPC=http://127.0.0.1:8545
# anvil's first account, which deploys and owns everything here.
DEPLOYER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! curl -s -o /dev/null -m 2 "$RPC"; then
  echo "Starting anvil…"
  # Detached, with its own output: a background child holding this script's stdout open would
  # stop anything reading from it (a pipe, or $(...)) from ever finishing.
  anvil --silent --port 8545 >/tmp/payeer-anvil.log 2>&1 &
  disown
  until curl -s -o /dev/null -m 2 "$RPC"; do sleep 1; done
fi

echo "Deploying the fixture…"
out=$(cd "$ROOT/../contracts" && forge script script/LocalFixture.s.sol \
  --rpc-url "$RPC" --broadcast --private-key "$DEPLOYER" 2>&1)

pick() { echo "$out" | grep -E "^  $1" | awk '{print $NF}'; }
USDC=$(pick "USDC:"); PAYEER=$(pick "Payeer:"); PACTS=$(pick "Pacts:")

if [ -z "$PACTS" ]; then
  echo "$out" | tail -20
  echo "Deployment failed." >&2
  exit 1
fi

env_line="NEXT_PUBLIC_NETWORK=local NEXT_PUBLIC_USDC_ADDRESS=$USDC NEXT_PUBLIC_PAYEER_ADDRESS=$PAYEER NEXT_PUBLIC_PACTS_ADDRESS=$PACTS"

cat <<EOF

Ready. USDC $USDC · Payeer $PAYEER · Pacts $PACTS

  $env_line pnpm dev --port 3050
  PACTS_ADDRESS=$PACTS node e2e/settle-check.mjs http://127.0.0.1:3050

Import anvil's second account into a wallet to be the winner:
  0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
EOF

if [ "${1:-}" = "--dev" ]; then
  cd "$ROOT" && env $env_line pnpm dev --port 3050
fi
