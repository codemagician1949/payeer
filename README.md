<div align="center">

<img src="web/public/logo-mark.svg" width="72" alt="">

# Payeer

**Money between friends, on [Arc](https://docs.arc.io).**
Request USDC with a link, spin a wheel to decide who pays the bill, and lock stakes
with friends in escrow that settles itself.

[**Live app**](https://payeer-arc.vercel.app) · [Payeer contract](https://explorer.arc.io/address/0xa2D77721d840f5205Cede13523135605c5244FFA) · [Pacts contract](https://explorer.arc.io/address/0x263d7d3eEEC65F24D815c119881624Fed6C9d032)

</div>

---

## Overview

Splitting money with friends is a social problem, not a technical one. Existing apps handle the
*transfer*; none of them handle the *decision* — who pays, who was right, and who holds the money
in between. Payeer handles all three, and settles them on-chain.

It is built for Arc specifically. On Arc the gas token **is** USDC, which removes the step that
kills consumer crypto onboarding: there is no second asset to buy and no "you need ETH for gas"
conversation. At roughly **$0.003 a transaction**, settling 50p between friends is finally worth
doing at all.

| | |
|---|---|
| **Network** | Arc mainnet (chain `5042`) |
| **Status** | Deployed and in use — see [Verified on mainnet](#verified-on-mainnet) |
| **Contracts** | UUPS upgradeable, 54 tests (49 unit/fuzz/upgrade + 5 against real Arc USDC) |
| **Stack** | Solidity 0.8.28 · Foundry · Next.js 16 · wagmi v3 + viem · Tailwind v4 |
| **Circle** | Programmable Wallets, CCTP v2, USDC-as-gas |

---

## Features

### Payment links
Create a request for a fixed or open amount, with an optional note and expiry, and share it as a
link or QR code. Whoever opens it pays in one tap, and a link can be made reusable so several
people pay the same one — which is how a split bill actually works. Shared into a chat app, the
link preview shows the amount and note read live from the chain.

A request is an **invoice, not an escrow**: nothing is held anywhere, and USDC moves straight from
the payer's wallet to the creator's. Cancelling or expiring a link costs nobody anything, and the
app says so on screen rather than leaving a dead end.

### Bill spinner
Add everyone at the table and spin. The person it lands on pays, and the result turns into a
payment link for them or an even split for the group. Open a room instead and the whole table
scans a QR code: one synchronised wheel, a shared chat and a shared bill total, with every phone
landing on the same person. Guests join by name and need no wallet at all.

### Provable fairness
If a wheel decides who pays, "trust us" is not an answer. The result comes from
[drand](https://drand.love)'s `quicknet` beacon, where a threshold of independent organisations
jointly sign a new value every three seconds.

1. **Commit** — a spin names a round that *hasn't happened yet*, so the outcome cannot be known
   when the wheel starts turning.
2. **Reveal** — when the round arrives, every device fetches it and verifies its BLS signature
   against quicknet's pinned public key.
3. **Derive** — each client computes the winner itself:
   ```
   winner = keccak256(randomness ‖ room ‖ names) mod count
   ```

The server never picks a winner; it only relays which round a spin is waiting for. Clients
**reject a round whose time has already passed**, which is the one trick a tampered server could
otherwise play — replaying a beacon it already knew. Each result shows its round number and links
to the beacon, so anyone at the table can check it. `e2e/fairness-check.mjs` verifies the
derivation is deterministic and uniform: **chi-square 2.30 over 120,000 draws**.

### Pacts — group escrow
A bet between friends, with the money actually held. Everyone stakes the same amount on one of up
to eight outcomes; the contract holds the USDC — not a friend, not Payeer — and backers of the
winning outcome split the pot. Up to twenty people, which also covers a fitness challenge, a group
forecast, or a deposit nobody quite trusts the other to hold.

Two ways to settle:

- **Everyone agrees** — pays out the moment every participant confirms the same outcome.
- **AI checks the result** — for public events. Claude searches for the result and posts it
  on-chain with its source. Anyone in the pact then has a challenge window (24h by default) to
  object, which drops the pact back to needing everyone's agreement.

**Funds can never get stuck.** If nothing settles by the deadline everyone reclaims their stake,
an outcome nobody backed refunds the pot, and payouts are pull-based so one unreachable winner
never blocks the others.

### Settlement alerts
A pact can finish with nobody watching — the AI posts a result, the objection window runs out, and
anyone at all can release the payout. Payeer shows what's waiting as a banner and a count on the
Pacts tab, and on an unfinished pact it offers to notify you properly, so the result reaches a tab
left open in the background.

### Add money
Most people's USDC is on Base, Arbitrum, Optimism or Ethereum rather than Arc. The Add money page
moves it across with Circle's CCTP: burn on the source chain, wait for Circle's attestation, mint
on Arc. A transfer interrupted mid-flight is resumable — reopening the page offers to finish
collecting it.

### Sign-in, two ways
Connect an existing wallet through Reown AppKit (550+ wallets, WalletConnect QR for phones), or
**sign in with an email address**, which Circle handles end to end: Circle mails the code, verifies
it, creates the wallet on Arc and keeps the key shares. Payeer never sees a private key either way.

### Also
**Batch payouts** to up to 50 people in one transaction · **Group chat** per pact over WebSockets,
gated on-chain, with an `/ask` AI helper · **Activity** feed with explorer links · **Installable**
to a phone's home screen with shortcuts into Request and Spin.

---

## Architecture

```
contracts/   Foundry workspace
             Payeer.sol        requests, sends, batch payouts, activity feed
             Pacts.sol         group escrow with AI-assisted settlement
             script/           deployment and a local fixture
             test/             49 unit/fuzz/upgrade tests + 5 Arc fork tests

web/         Next.js 16 application
             app/api/resolve   the AI result checker (Claude, or Groq)
             app/api/circle/*  Circle wallets: email sign-in, PIN-approved transactions
             server/chat.mjs   WebSocket server for pact chat and spinner rooms
             lib/cctp.ts       cross-chain USDC transfers into Arc
             lib/fairness.ts   drand beacon fetch, verification and winner derivation
             e2e/              browser tests, including a two-browser room test
             scripts/local.sh  a local chain with pacts pre-staged, for the settle tests

verification/  standard JSON input and constructor args for explorer verification
```

### Design decisions

**State lives on-chain, not in a database.** Requests, pact terms, participants and each user's
activity feed are read straight from the contracts, so there is no backend to keep in sync. Arc
RPCs cap `eth_getLogs` ranges at a few thousand blocks (~30 minutes at 0.5s blocks), so the
activity feed is kept in contract storage rather than reconstructed from events.

**The AI can propose, never pay.** The resolver key can only call `proposeOutcome`. Participants
can dispute, and a disputed result falls back to unanimous agreement. A wrong or manipulated
answer cannot move anyone's money on its own. The same discipline applies to Circle wallets:
`/api/circle/execute` will only sign calls to Payeer's own contracts, and only `approve` on USDC.

**One account abstraction.** `useActiveAccount` hides whether someone connected a wallet or signed
in by email; `useTx` picks the right path including the USDC approval each needs. A wallet
transaction returns logs, so new ids come from the receipt; Circle settles asynchronously, so ids
are read back from the creator's own on-chain list instead.

**Upgradeable by design.** Both contracts sit behind UUPS proxies with storage gaps, so features
can be added without asking anyone to move to a new address. The upgrade tests cover that a
stranger cannot upgrade, that live pacts keep their escrowed stakes across an upgrade, and that
transferring ownership moves the upgrade rights with it.

**Arc's USDC is the gas token.** Balance and gas come from the same pot, and transfers route
through native precompiles including a blocklist check. The fork tests stub those precompiles,
which is the only way to exercise the real token off-chain.

**Chat needs a long-running process.** `server/chat.mjs` holds WebSocket connections, so it runs
as its own service rather than on a serverless platform. The web app works fine without it; chat
simply doesn't appear.

---

## Getting started

### Contracts

```bash
cd contracts
npm install                   # OpenZeppelin; foundry.toml remaps to it
forge test                    # unit, fuzz and upgrade tests
forge test --match-path test/ArcFork.t.sol --fork-url arc    # against real Arc USDC
```

### Web app

```bash
cd web
cp .env.example .env.local    # fill in the contract addresses
pnpm install
pnpm dev                      # the app
pnpm chat                     # the chat + rooms server, in a second terminal
```

> **Note** — reach the dev server on the same host it was started on. Next blocks cross-origin dev
> resources, so opening `127.0.0.1` when the server expects `localhost` silently breaks hydration:
> the page renders but nothing responds. `allowedDevOrigins` in `next.config.ts` covers both.

---

## Testing

The browser tests drive a real browser and inject a test wallet that signs with viem, so wallet
flows are exercised rather than mocked.

```bash
node e2e/run.mjs   http://127.0.0.1:3000           # every page, wallet connection, mobile layout
node e2e/run.mjs   http://127.0.0.1:3000 --spend   # also creates and pays a real request
node e2e/room.mjs  http://127.0.0.1:3000           # two browsers in one spinner room
node e2e/fairness-check.mjs                        # the wheel is uniform (chi-square, 120k draws)
```

A settled pact cannot be staged on Arc — settling one costs real money, and Arc's USDC cannot run
off-chain — so that path runs against a local chain. `scripts/local.sh` starts anvil, deploys a
mock USDC and both contracts, and leaves two pacts behind: one already settled with winnings
waiting, one still being decided.

```bash
./scripts/local.sh                                 # prints the dev command and the addresses
PACTS_ADDRESS=0x… node e2e/settle-check.mjs http://127.0.0.1:3050
```

That suite settles the second pact out from under a running browser and checks a notification
arrives — the part that cannot be seen by reading the code.

### Verified on mainnet

Tests prove the code does what it says. The following are the same flows run against the
**deployed contracts with real USDC**, so the claims can be checked on the explorer rather than
taken on trust:

- A payment request **created and paid between two wallets**, through the browser rather than a
  script. The amount and memo on the pay page are read live from the contract.
- A pact **staked, settled and claimed** — 0.05 USDC each from two wallets, 0.10 held in escrow,
  both participants confirming the same outcome, the winner claiming the pot. The contract's
  balance returned to **exactly zero**: the property the fuzz test asserts, with no dust stranded.
- **`batchPay`** paying two recipients in one transaction, with the on-chain activity feed
  recording both the batch and the incoming request payment against the right counterparties.

The whole exercise cost about **0.9 USDC** in stakes and gas.

---

## Deployment

### Contracts

```bash
cd contracts
RESOLVER=0xYourResolverAddress \
  forge script script/Deploy.s.sol --rpc-url arc --broadcast
```

The signing key comes from `DEPLOYER_PRIVATE_KEY` in `contracts/.env` (gitignored), or from
`--account <keystore>` or `--interactive 1`. Whoever signs becomes the owner. `RESOLVER` is the
address allowed to propose AI-checked results — use a dedicated key holding only a little USDC for
gas, and put the same key in the web app's `RESOLVER_PRIVATE_KEY`.

Contract source verification goes through the explorer's web form; see
[`verification/README.md`](verification/README.md) for why, and for the files to upload.

### Application

Two processes: the Next.js app, and the chat server. Vercel hosts the app (root directory `web`)
and Railway hosts the chat service; both services deploy the same directory and `SERVICE=chat`
decides which one a process becomes.

`NEXT_PUBLIC_*` values are compiled in at build time, so set variables **before** the build you
intend to keep. `scripts/railway-env.sh` copies them across from `.env.local`.

<details>
<summary><b>Environment variables</b></summary>

**App service**

```
NEXT_PUBLIC_NETWORK=arc
NEXT_PUBLIC_PAYEER_ADDRESS=0xa2D77721d840f5205Cede13523135605c5244FFA
NEXT_PUBLIC_PACTS_ADDRESS=0x263d7d3eEEC65F24D815c119881624Fed6C9d032
NEXT_PUBLIC_REOWN_PROJECT_ID=…
NEXT_PUBLIC_CHAT_URL=wss://<chat service domain>
RESOLVER_PRIVATE_KEY=…           # optional, for AI-checked pacts
GROQ_API_KEY=…                   # optional, powers the in-chat helper
CIRCLE_API_KEY=…                 # optional, enables email sign-in
NEXT_PUBLIC_CIRCLE_APP_ID=…
```

**Chat service**

```
NEXT_PUBLIC_NETWORK=arc
NEXT_PUBLIC_PACTS_ADDRESS=0x263d7d3eEEC65F24D815c119881624Fed6C9d032
GROQ_API_KEY=…
ALLOWED_ORIGINS=https://<app domain>
SERVICE=chat
```

`ALLOWED_ORIGINS` keeps other sites from opening sockets against your rooms and is matched
exactly, so every domain the app answers on must be listed. Leave it unset locally. Check the
service with `curl https://<chat-domain>/health`, which answers `{"ok":true,"rooms":0}`; HTML back
means `SERVICE` didn't take and it is still running the website.

Add the app's domain to Reown (cloud.reown.com → your project → Allowed Domains), or the wallet
modal refuses to open in production. Without `NEXT_PUBLIC_REOWN_PROJECT_ID` the app still serves —
the connect button reads "Wallets unavailable" — rather than erroring on every request.

</details>

---

## Circle integration

Everything Circle provides is called through Circle: wallets and email sign-in via their API and
`@circle-fin/w3s-pw-web-sdk`, cross-chain USDC via CCTP and Circle's attestation service. No
third-party stands in for a Circle service.

**Only email sign-in needs a Circle API key.** Everything else runs on Arc mainnet with no Circle
account at all — including Add money, which uses Circle's public CCTP contracts and their
attestation service, neither of which is authenticated.

A Circle key is scoped to either testnets or mainnets, and the app follows it: with a
`TEST_API_KEY` the wallets live on Arc testnet, so email sign-in is offered only when the key's
network matches the app's. `/api/circle/config` reports what is actually usable and the UI offers
only that, rather than failing later.

Email sign-in also needs an **SMTP provider** — Circle sends the one-time code through credentials
you supply. In the Circle console under **Wallets → User Controlled → Configurator →
Authentication Methods → Email**, set a From address and the SMTP host, port, username and
password.

```bash
pnpm dev:testnet     # Arc testnet + the testnet contracts, for trying email sign-in
pnpm dev             # back to Arc mainnet
```

---

## Deployed contracts

Both are UUPS proxies: the addresses below are permanent, and the logic behind them can be
replaced by the owner without moving funds or losing history.

**Arc mainnet** (chain `5042`)

| | Proxy | Implementation |
|---|---|---|
| Payeer | [`0xa2D77721d840f5205Cede13523135605c5244FFA`](https://explorer.arc.io/address/0xa2D77721d840f5205Cede13523135605c5244FFA) | `0x97F5F01F1DC69cf96fd86Ef667cD0A6B80C7CD0F` |
| Pacts | [`0x263d7d3eEEC65F24D815c119881624Fed6C9d032`](https://explorer.arc.io/address/0x263d7d3eEEC65F24D815c119881624Fed6C9d032) | `0x13118d23439A823718Df202B37A0b1DeD931a108` |

**Arc testnet** (chain `5042002`, funded from [faucet.circle.com](https://faucet.circle.com))

| | Proxy |
|---|---|
| Payeer | `0xBD830B36c543dd6a0604dDeDAC42C0C6B0e36c0a` |
| Pacts | `0xeAD7d8d12852bB45B966864957A35f8c603fC208` |

USDC is at `0x3600000000000000000000000000000000000000` on both, with 6 decimals through its
token interface.

---

## Security and known limitations

Stated plainly, because both are real and a reviewer will find them anyway.

**A single wallet holds upgrade rights.** The owner can replace the logic of a contract holding
other people's escrowed USDC. That is the weakest part of this deployment: a multisig would mean
no one key could do it alone, and that is where this should end up before Payeer holds anything
meaningful.

**A blocklisted participant cannot be paid.** On Arc, Circle can blocklist an address, and USDC
transfers to it revert. `claim` pays only to the claimant, so someone blocklisted after staking
can never collect and their share stays in the contract. The alternative is an owner-only rescue
that redirects a share, which hands the owner power over other people's money. Between the two,
leaving the funds untouchable is the safer default — a deliberate choice, not an oversight.

---

## Licence

MIT
