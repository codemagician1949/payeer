/**
 * Checks what a winner actually sees when a pact finishes.
 *
 *   node e2e/settle-check.mjs [baseUrl]
 *
 * Expects a local anvil carrying the fixture from contracts/script/LocalFixture.s.sol: one
 * settled pact with winnings waiting, and one still being decided. Arc's own USDC can't run
 * off-chain, so this is the only way to exercise a settled pact end to end.
 */
import { chromium } from "@playwright/test";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const base = (process.argv[2]?.startsWith("http") && process.argv[2]) || "http://127.0.0.1:3050";
const RPC = "http://127.0.0.1:8545";
const PACTS = process.env.PACTS_ADDRESS ?? "0x0165878A594ca255338adfa4d48449f69242Eb8F";
// anvil's second and third accounts, which is who the fixture stakes with.
const winnerKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const loserKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message.split("\n")[0]}`);
    console.log(`  ✗ ${name}\n      ${err.message.split("\n")[0]}`);
  }
}

/** Same injected wallet as the other suites, pointed at the local chain. */
async function installLocalWallet(context, privateKey) {
  const account = privateKeyToAccount(privateKey);
  const rpc = RPC;
  const wallet = createWalletClient({ account, chain: foundry, transport: http(rpc) });
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpc) });

  await context.exposeFunction("__walletRpc", async ({ method, params = [] }) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return `0x${foundry.id.toString(16)}`;
      case "net_version":
        return String(foundry.id);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
      case "wallet_revokePermissions":
        return null;
      case "wallet_getPermissions":
      case "wallet_requestPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_getCapabilities":
        return {};
      case "personal_sign":
        return wallet.signMessage({ message: { raw: params[0] } });
      case "eth_sendTransaction":
        return wallet.sendTransaction({
          to: params[0].to,
          data: params[0].data,
          value: params[0].value ? BigInt(params[0].value) : undefined,
        });
      default:
        if (method.startsWith("wallet_")) throw Object.assign(new Error(`Unsupported ${method}`), { code: 4200 });
        return publicClient.request({ method, params });
    }
  });

  await context.addInitScript(({ address }) => {
    const provider = {
      isMetaMask: true,
      request: (args) => window.__walletRpc({ method: args.method, params: args.params ?? [] }),
      on: () => provider,
      removeListener: () => provider,
      selectedAddress: address,
    };
    window.ethereum = provider;
    const info = { uuid: "11111111-2222-3333-4444-555555555555", name: "MetaMask", rdns: "io.metamask", icon: "data:image/svg+xml;base64,PHN2Zy8+" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, { address: account.address });

  return account;
}

/** AppKit occasionally drops the session on a direct load, so this retries like a person would. */
async function ensureConnected(page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (/0x[0-9a-fA-F]{4}…/.test(await page.locator("header").innerText())) return true;
    await page.waitForTimeout(3000);
    if (/0x[0-9a-fA-F]{4}…/.test(await page.locator("header").innerText())) return true;

    const connect = page.locator("button").filter({ hasText: /^Connect$|Connect to continue|Get started/ }).first();
    if (await connect.count()) {
      await connect.click();
      await page.waitForTimeout(2500);
      const entry = page.locator("w3m-modal, appkit-modal").getByText(/MetaMask/i).first();
      if (await entry.count()) await entry.click({ timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }
  }
  return /0x[0-9a-fA-F]{4}…/.test(await page.locator("header").innerText());
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90_000);
page.setDefaultTimeout(45_000);
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.split("\n")[0].slice(0, 180)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/_next\/hmr|web3modal|walletconnect/i.test(m.text())) {
    problems.push(`console: ${m.text().split("\n")[0].slice(0, 180)}`);
  }
});
// The watcher only raises a notification if the browser has granted permission.
await context.grantPermissions(["notifications"], { origin: base });
await installLocalWallet(context, winnerKey);

console.log(`\nSettled-pact notifications — ${base}\n`);

await page.goto(base, { waitUntil: "load" });
if (!(await ensureConnected(page))) {
  console.log("  ✗ couldn't connect the wallet");
  process.exit(1);
}
// The wallet modal stays up after connecting and hides the page behind it.
await page.keyboard.press("Escape");
await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(8_000); // let the pact list load and the watcher run

if (process.env.DEBUG) {
  console.log("  url:", page.url());
  console.log("  header:", (await page.locator("header").innerText()).replace(/\n/g, " "));
  console.log("  body:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n/g, " | "));
  console.log("  errors:", problems.slice(0, 6).join(" || ") || "none");
}

await check("a settled pact raises the claim banner", async () => {
  const banner = page.getByText(/You won:|money waiting for you/i).first();
  await banner.waitFor({ state: "visible", timeout: 20_000 });
});

await check("the banner shows what there is to claim", async () => {
  const text = await page.locator("body").innerText();
  if (!/\$20\.00/.test(text)) throw new Error(`expected $20.00 in the banner, body had: ${text.slice(0, 200)}`);
});

await check("the Pacts tab carries a count", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const badge = page.locator("a[href='/pacts'] span", { hasText: /^1$/ }).first();
  await badge.waitFor({ state: "visible", timeout: 10_000 });
});

await check("the banner leads straight to the pact", async () => {
  await page.getByText(/You won:|money waiting for you/i).first().click();
  await page.waitForURL(/\/pacts\/1$/, { timeout: 10_000 });
  await page.getByRole("button", { name: /Claim winnings/i }).first().waitFor({ state: "visible", timeout: 15_000 });
});

await check("a pact the browser has refused notifications for doesn't nag", async () => {
  // Headless Chromium reports "denied" however permissions are granted, which is the case
  // where the prompt must stay hidden rather than offering something that can't work.
  await page.goto(`${base}/pacts/2`, { waitUntil: "load" });
  await page.waitForTimeout(5_000);
  const denied = await page.evaluate(() => Notification.permission);
  if (denied !== "denied") throw new Error(`expected a denied browser, got ${denied}`);
  if (await page.getByText(/Notify me when this settles/i).count()) throw new Error("offered to notify despite being denied");
});

await check("an unfinished pact offers to notify you, and confirms once allowed", async () => {
  // A second page with the Notification API stubbed to a fresh, undecided browser.
  const fresh = await context.newPage();
  await fresh.addInitScript(() => {
    let state = "default";
    window.Notification = class {
      static get permission() {
        return state;
      }
      static requestPermission() {
        state = "granted";
        return Promise.resolve("granted");
      }
    };
  });
  await fresh.goto(`${base}/pacts/2`, { waitUntil: "load" });
  const ask = fresh.getByRole("button", { name: /Notify me when this settles/i }).first();
  await ask.waitFor({ state: "visible", timeout: 30_000 });
  await ask.click();
  await fresh.getByText(/You'll be notified when this settles/i).first().waitFor({ state: "visible", timeout: 15_000 });
  await fresh.close();
});

await check("claiming clears the banner", async () => {
  await page.goto(`${base}/pacts/1`, { waitUntil: "domcontentloaded" });
  const claim = page.getByRole("button", { name: /Claim winnings/i }).first();
  await claim.waitFor({ state: "visible", timeout: 20_000 });
  await claim.click();
  await page.waitForFunction(() => !/You won:|money waiting for you/i.test(document.body.innerText), { timeout: 45_000 });
});

await check("a pact that settles while you're watching raises a notification", async () => {
  const watcher = await context.newPage();
  // Record notifications instead of showing them; headless Chromium won't display real ones.
  await watcher.addInitScript(() => {
    window.__notifications = [];
    window.Notification = class {
      constructor(title, options) {
        window.__notifications.push({ title, body: options?.body ?? "" });
      }
      static get permission() {
        return "granted";
      }
      static requestPermission() {
        return Promise.resolve("granted");
      }
    };
  });
  await watcher.goto(base, { waitUntil: "load" });
  // Let the watcher take its baseline: pact 2 is still being decided, so nothing is waiting yet.
  await watcher.waitForTimeout(12_000);
  const before = await watcher.evaluate(() => window.__notifications.length);
  if (before !== 0) throw new Error(`notified ${before} times before anything settled`);

  // Settle pact 2 behind its back: both sides confirm the same outcome.
  for (const key of [winnerKey, loserKey]) {
    const signer = createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: http(RPC) });
    await signer.writeContract({
      address: PACTS,
      abi: [{ name: "vote", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint8" }], outputs: [] }],
      functionName: "vote",
      args: [2n, 1],
    });
  }

  // The pact list refetches every 10s, so give it two rounds.
  await watcher.waitForFunction(() => window.__notifications.length > 0, { timeout: 45_000 });
  const [note] = await watcher.evaluate(() => window.__notifications);
  if (!/won a pact/i.test(note.title)) throw new Error(`unexpected title: ${note.title}`);
  if (!/\$20\.00/.test(note.body)) throw new Error(`notification didn't say how much: ${note.body}`);
  await watcher.close();
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
await browser.close();
process.exit(failures.length ? 1 : 0);
