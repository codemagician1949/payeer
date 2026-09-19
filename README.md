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

**Sign-in, two ways** — Connect an existing wallet through Reown AppKit (550+ wallets, WalletConnect QR for phones), or **sign in with an email address**, which Circle handles end to end: Circle mails the code, verifies it, creates the wallet on Arc and keeps the key shares. Payeer never sees a private key either way. Screens that create something on-chain ask for sign-in up front rather than letting someone fill in a form and hit a wall; guests joining a spinner room need nothing at all.

Everything Circle provides is called through Circle: wallets and email sign-in via their API and
`@circle-fin/w3s-pw-web-sdk`, cross-chain USDC via CCTP and Circle's attestation service. No
third-party stands in for a Circle service.

**Spinner rooms** — Start a room, everyone scans the QR code and joins by name (no wallet needed). One wheel, synchronised: the server picks the winner so every phone lands on the same person, with a shared chat and a shared bill total. When the wheel lands on you, you can **pay the person who fronted the bill in one tap**, because anyone signed in shares where to pay them; otherwise the result becomes a payment link.

**Nobody can rig the wheel — including whoever runs Payeer.** The result comes from
[drand](https://drand.love)'s `quicknet` beacon, a public randomness service where a threshold of
independent organisations jointly sign a new value every three seconds. A spin names a round that
*hasn't happened yet*, so the outcome cannot be known when the wheel starts turning. When the round
arrives, every device fetches it, verifies its BLS signature against quicknet's pinned public key,
and derives the winner itself:

```
winner = keccak256(randomness ‖ room ‖ names) mod count
```

The server never picks a winner; it only relays which round a spin is waiting for, and clients
**reject a round whose time has already passed**, which is what would let a tampered server replay
a beacon it already knew. Each result shows its round number and links to the beacon, so anyone at
the table can check it. `e2e/fairness-check.mjs` verifies the derivation is deterministic and
uniform (chi-square over 120,000 draws).

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
             server/chat.mjs   the WebSocket server (pact chat + spinner rooms)
             e2e/              browser tests, including a two-browser room test
             lib/cctp.ts       cross-chain USDC transfers into Arc
             api/circle/*      Circle wallets: email sign-in and PIN-approved transactions
```

Some design notes:

- **State lives on-chain, not in a database.** Requests, pact terms, participants and each user's activity feed are all read straight from the contracts, so the app has no backend to keep in sync. Arc RPCs cap `eth_getLogs` ranges at a few thousand blocks (~30 minutes of history at 0.5s blocks), so the activity feed is stored in contract storage rather than reconstructed from events.
- **One account abstraction.** `useActiveAccount` hides whether someone connected a wallet or signed in by email; `useTx` picks the right path, including the extra USDC approval each needs. A wallet transaction returns logs, so new ids come from the receipt; Circle settles asynchronously, so ids are read back from the creator's own on-chain list instead.
- **The AI can propose, never pay.** The resolver key can only call `proposeOutcome`. Participants can dispute, and a disputed result falls back to unanimous agreement. A wrong or manipulated answer cannot move anyone's money on its own.
- **Upgradeable by design.** Both contracts sit behind UUPS proxies with storage gaps, so features can be added later without asking anyone to move to a new address.
- **Payment links have real link previews.** Sharing one into a chat app shows the amount and note, read live from the chain.
- **Arc's USDC is the gas token.** Balance and gas come from the same pot, and transfers route through native precompiles (including a blocklist check). The fork tests stub those precompiles, which is the only way to exercise the real token off-chain.
- **Dev servers must be reached on the same host they were started on.** Next blocks cross-origin dev resources, so opening `127.0.0.1` when the server expects `localhost` silently breaks hydration — the page renders but nothing responds. `allowedDevOrigins` in `next.config.ts` covers both.
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
pnpm chat    # the chat + rooms server, in a second terminal
```

Browser tests (needs both running):

```bash
node e2e/run.mjs http://127.0.0.1:3000           # every page, wallet connection, mobile layout
node e2e/run.mjs http://127.0.0.1:3000 --spend   # also creates and pays a real request
node e2e/room.mjs http://127.0.0.1:3000          # two browsers in one spinner room
```

The tests drive a real browser and inject a test wallet that signs with viem, so wallet flows are
exercised rather than mocked.

Deploying:

```bash
cd contracts
RESOLVER=0xYourResolverAddress \
  forge script script/Deploy.s.sol --rpc-url arc --account <keystore> --broadcast
```

`RESOLVER` is the address allowed to propose AI-checked results. Use a dedicated key holding only a little USDC for gas; put the same key in the web app's `RESOLVER_PRIVATE_KEY`, alongside a result-checker key (`ANTHROPIC_API_KEY`, or `GROQ_API_KEY` with `GROQ_SEARCH_MODEL`). Leave them unset and AI-settled pacts aren't offered at all — the option is disabled in the UI rather than failing later.

Email sign-in needs `CIRCLE_API_KEY` and `NEXT_PUBLIC_CIRCLE_APP_ID`. A Circle key is scoped to
either testnets or mainnets, and the app follows it: with a `TEST_API_KEY` the wallets live on Arc
testnet, so email sign-in is offered only when the key's network matches the app's. Circle refuses
mainnet outright with a test key, and a live key without Programmable Wallets returns `Forbidden`.
`/api/circle/config` reports what's actually usable, and the UI offers only that.

Transactions from a Circle wallet go through `/api/circle/execute`, which will only sign calls to
Payeer's own contracts, and only `approve` on USDC.

Arc mainnet is chain 5042 (`https://rpc.mainnet.arc.io`), testnet is 5042002 (`https://rpc.testnet.arc.io`, funded from [faucet.circle.com](https://faucet.circle.com)). USDC is at `0x3600000000000000000000000000000000000000` on both, with 6 decimals through its token interface.

## What needs a Circle account, and what doesn't

Only email sign-in needs a Circle API key. Everything else runs on Arc mainnet with no Circle
account at all — including **Add money**, which uses Circle's public CCTP contracts and their
attestation service, neither of which is authenticated.

Circle issues testnet keys free; mainnet is a separate onboarding step in their console
("Access Mainnet"). Wallets are free for the first 1,000 active wallets a month. Without a mainnet
key the app simply doesn't offer email sign-in, and wallet sign-in covers everyone.

Email sign-in also needs an **SMTP provider**: Circle sends the one-time code through credentials
you supply, rather than from its own servers. In the Circle console under
**Wallets → User Controlled → Configurator → Authentication Methods → Email**, set a From address
and the SMTP host, port, username and password. Mailtrap's sandbox is fine for testing — the codes
land in Mailtrap's inbox rather than a real one — but delivering to other people's inboxes needs a
verified sending domain.

## Trying email sign-in

A Circle key is scoped to one side of the network divide, so email sign-in only appears where the
key can actually create a wallet. With a `TEST_API_KEY`, run the app against Arc testnet, where the
contracts are also deployed:

```bash
pnpm dev:testnet     # Arc testnet + the testnet contracts
pnpm dev             # back to Arc mainnet
```

The gate says so on screen rather than hiding the option silently.

## Arc contracts

Both are UUPS proxies: the addresses below are permanent, and the logic behind them can be
replaced by the owner without moving funds or losing history.

| | Address (proxy) | Implementation |
|---|---|---|
| Payeer | [`0x7659C2E485D3E29dBC36f7E11de9E633ED1FDa06`](https://explorer.arc.io/address/0x7659C2E485D3E29dBC36f7E11de9E633ED1FDa06) | `0xEa3245683904A3CF3ad5A5ada56Af007dBc9eaB6` |
| Pacts | [`0x1D485d692E5D21e614Cd5197Cd0f05f5b72A23D2`](https://explorer.arc.io/address/0x1D485d692E5D21e614Cd5197Cd0f05f5b72A23D2) | `0xd74f3b3f4f2FF04E3eFE2B494A4BE93Eb55E7A94` |

On Arc testnet (chain 5042002), for trying email sign-in:

| | Address (proxy) |
|---|---|
| Payeer | `0xBD830B36c543dd6a0604dDeDAC42C0C6B0e36c0a` |
| Pacts | `0xeAD7d8d12852bB45B966864957A35f8c603fC208` |

Upgrading is deliberate and owner-only: `upgradeToAndCall` on the proxy, from the owner. The
upgrade tests cover that a stranger can't do it, that live pacts keep their escrowed stakes
across an upgrade, and that transferring ownership moves the upgrade rights with it.

**The owner can replace the logic of a contract holding other people's escrowed USDC.** That
power should live with a wallet you trust — ideally a hardware wallet or a multisig — not with
a hot key.

## Licence

MIT.
