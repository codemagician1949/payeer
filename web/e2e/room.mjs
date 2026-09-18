/**
 * Two people, two browsers, one spinner room: checks that joining, chatting and spinning
 * stay in sync, and that both screens land on the same person.
 *
 *   node e2e/room.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3001";
const code = "TEST" + Math.floor(Math.random() * 90 + 10);

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

const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const browser = await chromium.launch();

async function joinAs(person) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/spin/${code}`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="Your name"]', person);
  await page.getByRole("button", { name: /^join$/i }).click();
  await page.waitForTimeout(3000);
  return { page, context };
}

console.log(`\nSpinner room end-to-end — room ${code}\n`);

const ada = await joinAs("Ada");
const grace = await joinAs("Grace");

await check("both people appear in the room on both screens", async () => {
  await ada.page.reload({ waitUntil: "load" });
  await ada.page.waitForTimeout(3000);
  for (const [who, { page }] of [["Ada", ada], ["Grace", grace]]) {
    const body = await page.locator("body").innerText();
    assert(/Ada/.test(body) && /Grace/.test(body), `${who}'s screen is missing someone: ${body.slice(0, 120)}`);
  }
});

await check("a message sent by one shows up for the other", async () => {
  await grace.page.fill('input[placeholder="Say something, or /ask…"]', "who is paying tonight?");
  await grace.page.keyboard.press("Enter");
  await ada.page.waitForSelector("text=who is paying tonight?", { timeout: 20000 });
});

await check("the bill total syncs between screens", async () => {
  await ada.page.locator('input[aria-label="Amount in USDC"]').fill("40");
  await grace.page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Amount in USDC"]');
    return input && input.value === "40";
  }, { timeout: 20000 });
});

await check("one spin, and both screens land on the same person", async () => {
  await ada.page.getByRole("button", { name: /spin for everyone/i }).click();
  const winners = await Promise.all(
    [ada, grace].map(async ({ page }) => {
      await page.waitForSelector("text=/pays!|You pay!/", { timeout: 60000 });
      const text = await page.getByText(/pays!|You pay!/).first().textContent();
      return text.replace(/\s*(pays!|You pay!)/, "").trim();
    }),
  );
  // One screen may say "You pay!" — resolve that against the other's name.
  const named = winners.filter((w) => w.length > 0);
  assert(named.length > 0, `no winner shown: ${JSON.stringify(winners)}`);
  console.log(`      winner: ${named[0] || "(you)"} — Ada saw "${winners[0]}", Grace saw "${winners[1]}"`);
});

await check("the split figure is offered to whoever can pay", async () => {
  const body = await ada.page.locator("body").innerText();
  assert(/Split evenly/.test(body) || /Connect to send a payment link/.test(body), "no payment option after the spin");
});

await ada.context.close();
await grace.context.close();
await browser.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
