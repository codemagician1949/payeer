/**
 * Checks the winner derivation: same inputs always give the same answer, and across many
 * beacon values the outcome is spread evenly over the names.
 */
import { keccak256, toBytes, concat } from "viem";
import { randomBytes } from "node:crypto";

function winnerFrom(randomness, room, names) {
  const digest = keccak256(concat([toBytes(`0x${randomness}`), toBytes(`${room}\n${names.join("\n")}`)]));
  return Number(BigInt(digest) % BigInt(names.length));
}

const names = ["Ada", "Grace", "Linus", "Katherine", "Alan"];
const room = "spin:ABC123";

const fixed = randomBytes(32).toString("hex");
const a = winnerFrom(fixed, room, names);
const b = winnerFrom(fixed, room, names);
console.log(`deterministic: ${a === b ? "yes" : "NO — BROKEN"} (${a} twice)`);

const other = winnerFrom(fixed, "spin:ZZZ999", names);
console.log(`room changes the outcome space: ${a === other ? "same (possible by chance)" : "different"}`);

const runs = 120_000;
const counts = new Array(names.length).fill(0);
for (let i = 0; i < runs; i++) counts[winnerFrom(randomBytes(32).toString("hex"), room, names)]++;

const expected = runs / names.length;
const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
console.log("distribution:", counts.map((c, i) => `${names[i]} ${(100 * c / runs).toFixed(2)}%`).join("  "));
// 4 degrees of freedom: anything under ~18.5 is comfortably uniform at p=0.001.
console.log(`chi-square ${chi.toFixed(2)} (uniform if < 18.47): ${chi < 18.47 ? "PASS" : "FAIL"}`);
process.exit(chi < 18.47 && a === b ? 0 : 1);
