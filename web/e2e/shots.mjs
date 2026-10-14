/**
 * Captures screenshots of the running app for the pitch deck.
 *
 *   node e2e/shots.mjs [baseUrl] [outDir]
 *
 * Uses the same injected wallet as the other suites, so the signed-in screens are real rather
 * than mocked: the balances, requests and pacts on them are read from Arc mainnet.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { installWallet } from "./wallet.mjs";

const base = (process.argv[2]?.startsWith("http") && process.argv[2]) || "http://127.0.0.1:3040";
const out = process.argv[3] || "/tmp/payeer-shots";
const S = "/private/tmp/claude-501/-Users-mac-Desktop-Talent-protocol-Base-Payeer/570668b9-a39a-4329-a79a-9ff114a92ad8/scratchpad";
const [, key] = readFileSync(`${S}/t1.txt`, "utf8").trim().split(" ");

mkdirSync(out, { recursive: true });

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
      await page.keyboard.press("Escape");
    }
  }
  return /0x[0-9a-fA-F]{4}…/.test(await page.locator("header").innerText());
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90_000);
await installWallet(page, key);

async function shot(name, path, prep) {
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  if (prep) await prep(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`  ${name}.png`);
}

console.log(`\nCapturing from ${base} into ${out}\n`);

// Signed out: the landing page as a first-time visitor meets it.
await shot("landing", "/");

await page.goto(base, { waitUntil: "load" });
if (!(await ensureConnected(page))) {
  console.log("could not connect the wallet");
  process.exit(1);
}
await page.keyboard.press("Escape");

await shot("pay", "/pay/1");
await shot("fund", "/fund", async (p) => {
  await p.locator('input[aria-label="Amount in USDC"]').fill("250");
  await p.waitForTimeout(1500);
});
await shot("pacts", "/pacts");
await shot("pact", "/pacts/1");
await shot("request", "/request");
await shot("spin", "/spin", async (p) => {
  await p.waitForSelector('input[placeholder="Add a name"]', { timeout: 60_000 });
  for (const person of ["Ada", "Grace", "Linus", "Katherine"]) {
    await p.fill('input[placeholder="Add a name"]', person);
    await p.keyboard.press("Enter");
  }
  await p.waitForTimeout(1200);
});

// A phone, because that is where a bill actually gets split.
const phone = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const mobile = await phone.newPage();
await mobile.goto(`${base}/spin/DECK01`, { waitUntil: "load" });
await mobile.waitForTimeout(3000);
const nameField = mobile.locator('input[placeholder*="name" i]').first();
if (await nameField.count()) {
  await nameField.fill("Ada");
  await mobile.keyboard.press("Enter");
  await mobile.waitForTimeout(2500);
}
await mobile.screenshot({ path: `${out}/room-mobile.png` });
console.log("  room-mobile.png");

await browser.close();
console.log("\ndone");
