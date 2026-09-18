import { readFileSync, writeFileSync } from "node:fs";

const names = ["Payeer", "Pacts"];
let out = "// Generated from contracts/out by `pnpm abi`. Do not edit by hand.\n\n";
for (const name of names) {
  const { abi } = JSON.parse(readFileSync(`../contracts/out/${name}.sol/${name}.json`, "utf8"));
  const id = name[0].toLowerCase() + name.slice(1);
  out += `export const ${id}Abi = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
}
writeFileSync("src/lib/abi.ts", out);
console.log("wrote src/lib/abi.ts");
