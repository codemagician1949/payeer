/**
 * End-to-end run against a live Payeer, in a real browser.
 *
 *   node e2e/run.mjs [baseUrl] [--spend]
 *
 * Without --spend it exercises every page and the wallet connection. With --spend it also
 * creates and pays a real request on Arc mainnet using the funded test wallets, which costs
 * a few cents. Reads keys from the scratchpad files written during deployment.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { installWallet } from "./wallet.mjs";

const base = (process.argv[2]?.startsWith("http") && process.argv[2]) || "http://127.0.0.1:3001";
const spend = process.argv.includes("--spend");
const S = "/private/tmp/claude-501/-Users-mac-Desktop-Talent-protocol-Base-Payeer/570668b9-a39a-4329-a79a-9ff114a92ad8/scratchpad";
const [, payerKey] = readFileSync(`${S}/t1.txt`, "utf8").trim().split(" ");
const [, payeeKey] = readFileSync(`${S}/t2.txt`, "utf8").trim().split(" ");

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch();

async function newPage({ key } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  // A dev server compiles each route on first visit, which can take a while.
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Ignore dev-server hot-reload chatter and third-party wallet telemetry; keep our own errors.
  const noise = /_next\/hmr|rpc\.walletconnect\.org|pulse\.walletconnect|api\.web3modal\.org/;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location()?.url ?? "";
    if (noise.test(m.text()) || noise.test(where)) return;
    errors.push(`${m.text()}${where ? ` (${where.slice(0, 80)})` : ""}`);
  });
  if (key) await installWallet(page, key);
  return { page, context, errors };
}

console.log(`\nPayeer end-to-end — ${base}${spend ? " (spending real USDC)" : ""}\n`);

// ---------------------------------------------------------------- public pages
console.log("Public pages");
{
  const { page, context, errors } = await newPage();

  await check("landing page renders its headline", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const h1 = page.locator("h1");
    assert(await h1.isVisible(), "headline not visible");
    assert((await h1.evaluate((el) => getComputedStyle(el).opacity)) === "1", "headline stuck transparent — animations didn't run");
  });

  await check("theme toggle switches light and dark", async () => {
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click('button[aria-label="Toggle theme"]');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(before !== after, `theme did not change (stayed ${after})`);
    await page.click('button[aria-label="Toggle theme"]');
  });

  await check("wallet modal opens", async () => {
    await page.getByRole("button", { name: /get started|connect/i }).first().click();
    await page.waitForTimeout(2500);
    const modal = await page.evaluate(() => !!document.querySelector("w3m-modal, appkit-modal"));
    assert(modal, "Reown modal did not appear");
    await page.keyboard.press("Escape");
  });

  await check("request and spin ask for a wallet before showing their form", async () => {
    for (const path of ["/request", "/spin"]) {
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(2000);
      const body = await page.locator("body").innerText();
      assert(/Connect to continue/.test(body), `${path} did not ask for a wallet`);
      assert(!/Add a name|What's it for\?/.test(body), `${path} showed its form to a signed-out visitor`);
      assert(/never holds your money/.test(body), `${path} is missing the reassurances`);
      assert(/Connect to continue/.test(body), `${path} has no way to sign in`);
    }
  });

  await check("a guest can still join a spinner room without a wallet", async () => {
    await page.goto(`${base}/spin/GUEST1`, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    assert(/Join the room/.test(body), "guests are blocked from rooms");
    assert(/No wallet needed/.test(body), "missing the no-wallet reassurance");
  });

  await check("add money page lists source chains and quotes a fee", async () => {
    await page.goto(`${base}/fund`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    for (const chain of ["Base", "Arbitrum", "Optimism", "Ethereum"]) {
      assert(await page.getByRole("button", { name: new RegExp(chain) }).first().isVisible(), `${chain} missing`);
    }
    await page.locator('input[aria-label="Amount in USDC"]').fill("10");
    await page.waitForTimeout(1200);
    assert((await page.getByText(/arrives on Arc/).first().textContent()) !== null, "no arrival estimate");
  });

  await check("pay page shows a real on-chain request", async () => {
    await page.goto(`${base}/pay/1`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    assert(/Upgradeable smoke test/.test(body), "memo from chain not shown");
    assert(/\$0\.02/.test(body), "amount from chain not shown");
  });

  await check("activity, pacts and batch pages render", async () => {
    for (const path of ["/activity", "/pacts", "/pacts/new", "/batch"]) {
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      assert(await page.locator("h1").first().isVisible(), `${path} has no heading`);
    }
  });

  await check("no console errors on any public page", async () => {
    assert(errors.length === 0, `console errors: ${errors.slice(0, 2).join(" | ")}`);
  });

  await context.close();
}

// ---------------------------------------------------------------- mobile
console.log("\nMobile layout");
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await check("bottom navigation appears on a phone", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const nav = page.locator("nav").last();
    assert(await nav.isVisible(), "bottom nav missing");
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflows, "page scrolls sideways on mobile");
  });
  await context.close();
}

// ---------------------------------------------------------------- connected wallet
console.log("\nConnected wallet");
{
  const { page, context, errors } = await newPage({ key: payerKey });

  await check("connects the wallet and reaches the dashboard", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    let body = await page.locator("body").innerText();
    if (!/Your balance/.test(body)) {
      // Not reconnected from a previous session: pick the wallet out of Reown's modal.
      await page.locator("button").filter({ hasText: /Get started|Connect/ }).first().click();
      await page.waitForTimeout(2500);
      await page.locator("w3m-modal, appkit-modal").getByText(/Test Wallet/i).first().click({ timeout: 20000 });
      await page.waitForTimeout(5000);
      body = await page.locator("body").innerText();
    }
    assert(/Your balance/.test(body), "did not reach the signed-in dashboard");
    assert(/0x[0-9a-fA-F]{4}…/.test(body), "connected address not shown in the header");
  });

  await check("the spinner works once connected", async () => {
    await page.goto(`${base}/spin`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    for (const person of ["Ada", "Grace", "Linus"]) {
      await page.fill('input[placeholder="Add a name"]', person);
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /spin the wheel/i }).click();
    // The wheel turns while it waits for a future beacon round, then lands on the result.
    await page.waitForSelector("text=/pays!/", { timeout: 90000 });
    const heading = await page.getByText(/pays!/).first().textContent();
    assert(/Ada|Grace|Linus/.test(heading), `unexpected winner text: ${heading}`);
    const proof = await page.getByText(/drand round/).first().textContent();
    assert(/#\d{6,}/.test(proof), `no verifiable round shown: ${proof}`);
    await page.keyboard.press("Escape");
  });

  await check("dashboard shows the wallet's real Arc balance", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const balance = await page.getByText(/^\$\d+\.\d{2}$/).first().textContent();
    assert(Number(balance.replace("$", "")) > 0, `balance looks wrong: ${balance}`);
  });

  if (spend) {
    let payUrl;

    await check("creates a real payment request on Arc mainnet", async () => {
      await page.goto(`${base}/request`, { waitUntil: "load" });
      await page.waitForTimeout(2000);
      await page.locator('input[aria-label="Amount in USDC"]').fill("0.01");
      await page.fill('input[placeholder="Design work, dinner, rent…"]', "end-to-end run");
      await page.getByRole("button", { name: /^create link$/i }).click();
      await page.waitForSelector("text=Link ready", { timeout: 180000 });
      await page.getByRole("link", { name: /open link/i }).click();
      await page.waitForURL(/\/pay\/\d+/, { timeout: 30000 });
      payUrl = page.url();
      assert(/\/pay\/\d+$/.test(payUrl), `unexpected pay url: ${payUrl}`);
    });

    await check("a second wallet pays it, and the chain agrees", async () => {
      const { page: payer, context: payerContext } = await newPage({ key: payeeKey });
      await payer.goto(payUrl, { waitUntil: "load" });
      await payer.waitForTimeout(3000);
      await payer.getByRole("button", { name: /^pay \$0\.01$/i }).click();
      await payer.waitForSelector("text=Payment sent", { timeout: 240000 });
      await payerContext.close();

      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText();
      assert(/Paid/.test(body), "request not marked paid after payment");
    });
  }

  await check("no console errors while connected", async () => {
    assert(errors.length === 0, `errors: ${errors.slice(0, 2).join(" | ")}`);
  });

  await context.close();
}

await browser.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
