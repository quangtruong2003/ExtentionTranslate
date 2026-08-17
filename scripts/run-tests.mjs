import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageData = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const testScripts = Object.keys(packageData.scripts).filter((name) => name.startsWith("test:"));
const skippedScripts = new Set(
  process.env.CI === "true" && process.platform !== "win32" ? ["test:content-script"] : [],
);

for (const name of testScripts) {
  if (skippedScripts.has(name)) {
    console.log(`\n> ${name}\nSKIP: requires a Windows-installed Chromium browser in this environment.`);
    continue;
  }
  console.log(`\n> ${name}`);
  execSync(`npm run ${name}`, { stdio: "inherit" });
}

console.log(`PASS: ${testScripts.length - skippedScripts.size} test scripts; skipped ${skippedScripts.size} platform-specific script(s).`);
