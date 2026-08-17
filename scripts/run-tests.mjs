import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageData = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const testScripts = Object.keys(packageData.scripts).filter((name) => name.startsWith("test:"));

for (const name of testScripts) {
  console.log(`\n> ${name}`);
  execSync(`npm run ${name}`, { stdio: "inherit" });
}

console.log(`PASS: ${testScripts.length} test scripts`);
