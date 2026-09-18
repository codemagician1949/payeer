# Payeer

Money between friends, on [Arc](https://docs.arc.io). Request USDC with a link, spin a wheel to decide who pays the bill, and lock stakes with friends in escrow that can settle itself.

Arc pays gas in USDC, so people only ever hold one asset. No second token to buy, no "you need ETH for gas" conversation, and fees of roughly $0.002 per transaction.

## What it does

**Payment links** — Create a request for a fixed or open amount, with an optional note and expiry, and share it as a link or QR code. Whoever opens it pays in one tap. Optionally let several people pay the same link, which is how a split bill works.

**Bill spinner** — Add everyone at the table, spin the wheel, and the person it lands on pays. The result turns straight into a payment link for them, or an even split for the group. The wheel uses the browser's cryptographic random number generator, with rejection sampling so no slice is favoured.

**Pacts** — Group escrow. Everyone stakes the same amount on one of up to eight outcomes; backers of the winning outcome split the pot. Two ways to settle:

- *Everyone agrees* — it pays out the moment every participant confirms the same outcome.
- *AI checks the result* — for public events. Claude searches the web for the result and posts it on-chain with its source. Anyone in the pact then has a challenge window (24 hours by default) to object, which drops the pact back to needing everyone's agreement.

Funds can never get stuck: if nothing is settled by the deadline, everyone can reclaim their stake, and an outcome nobody backed refunds the pot.

**Batch payouts** — Pay up to 50 people in one transaction. Paste addresses and amounts straight from a spreadsheet.

**Group chat** — Everyone in a pact gets a live chat, over WebSockets. Membership is checked on-chain, so only people who actually staked can read or post, and they prove who they are by signing a message (free, moves no money). Start a line with `/ask` and an AI helper answers questions about how any of it works.

**Add money** — Most people's USDC is on Base, Arbitrum, Optimism or Ethereum rather than Arc. The Add money page moves it across with Circle's CCTP: burn on the source chain, wait for Circle's attestation, mint on Arc. If the page is closed mid-transfer the funds aren't lost; reopening it offers to finish collecting them.

**Activity** — Every payment, with links to the Arc explorer.

## How it's built

```
contracts/   Foundry. Payeer.sol (requests, sends, batch payouts, activity feed)
             and Pacts.sol (group escrow). 48 tests including a fuzz test
             proving payouts always sum exactly to the pot, plus fork tests
             that run every flow against Arc mainnet's real USDC.
web/         Next.js 16, Tailwind v4, shadcn/ui, wagmi v3 + viem, Motion.
             app/api/resolve   the AI result checker (Claude, or Groq)
             server/chat.mjs   the WebSocket chat server
             lib/cctp.ts       cross-chain USDC transfers into Arc
```

Some design notes:

- **State lives on-chain, not in a database.** Requests, pact terms, participants and each user's activity feed are all read straight from the contracts, so the app has no backend to keep in sync. Arc RPCs cap `eth_getLogs` ranges at a few thousand blocks (~30 minutes of history at 0.5s blocks), so the activity feed is stored in contract storage rather than reconstructed from events.
- **The AI can propose, never pay.** The resolver key can only call `proposeOutcome`. Participants can dispute, and a disputed result falls back to unanimous agreement. A wrong or manipulated answer cannot move anyone's money on its own.
- **Upgradeable by design.** Both contracts sit behind UUPS proxies with storage gaps, so features can be added later without asking anyone to move to a new address.
- **Payment links have real link previews.** Sharing one into a chat app shows the amount and note, read live from the chain.
- **Arc's USDC is the gas token.** Balance and gas come from the same pot, and transfers route through native precompiles (including a blocklist check). The fork tests stub those precompiles, which is the only way to exercise the real token off-chain.
- **Chat needs a long-running process.** `server/chat.mjs` holds WebSocket connections, so it runs as its own service rather than on a serverless platform. The web app works fine without it; chat just doesn't appear.

## Running it

```bash
# Contracts (OpenZeppelin comes from npm; foundry.toml remaps to it)
cd contracts && npm install
forge test                                   # unit + fuzz
forge test --match-path test/ArcFork.t.sol --fork-url arc    # against real Arc USDC

# Web app
cd web && cp .env.example .env.local   # fill in the contract addresses
pnpm install
pnpm dev     # the app
pnpm chat    # the chat server, in a second terminal
```

Deploying:

```bash
cd contracts
RESOLVER=0xYourResolverAddress \
  forge script script/Deploy.s.sol --rpc-url arc --account <keystore> --broadcast
```

`RESOLVER` is the address allowed to propose AI-checked results. Use a dedicated key holding only a little USDC for gas; put the same key in the web app's `RESOLVER_PRIVATE_KEY`, alongside a result-checker key (`ANTHROPIC_API_KEY`, or `GROQ_API_KEY` with `GROQ_SEARCH_MODEL`). Leave them unset and AI-settled pacts aren't offered at all — the option is disabled in the UI rather than failing later.

Arc mainnet is chain 5042 (`https://rpc.mainnet.arc.io`), testnet is 5042002 (`https://rpc.testnet.arc.io`, funded from [faucet.circle.com](https://faucet.circle.com)). USDC is at `0x3600000000000000000000000000000000000000` on both, with 6 decimals through its token interface.

## Arc contracts

Both are UUPS proxies: the addresses below are permanent, and the logic behind them can be
replaced by the owner without moving funds or losing history.

| | Address (proxy) | Implementation |
|---|---|---|
| Payeer | [`0x7659C2E485D3E29dBC36f7E11de9E633ED1FDa06`](https://explorer.arc.io/address/0x7659C2E485D3E29dBC36f7E11de9E633ED1FDa06) | `0xEa3245683904A3CF3ad5A5ada56Af007dBc9eaB6` |
| Pacts | [`0x1D485d692E5D21e614Cd5197Cd0f05f5b72A23D2`](https://explorer.arc.io/address/0x1D485d692E5D21e614Cd5197Cd0f05f5b72A23D2) | `0xd74f3b3f4f2FF04E3eFE2B494A4BE93Eb55E7A94` |

Upgrading is deliberate and owner-only: `upgradeToAndCall` on the proxy, from the owner. The
upgrade tests cover that a stranger can't do it, that live pacts keep their escrowed stakes
across an upgrade, and that transferring ownership moves the upgrade rights with it.

**The owner can replace the logic of a contract holding other people's escrowed USDC.** That
power should live with a wallet you trust — ideally a hardware wallet or a multisig — not with
a hot key.

## Licence

MIT.
