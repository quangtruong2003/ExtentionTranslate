import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

assert.match(workflow, /on:\s*[\s\S]*push:\s*[\s\S]*branches:\s*\[main\]/, "release workflow must run on main pushes");
assert.match(workflow, /workflow_dispatch:/, "release workflow must support manual runs");
assert.match(workflow, /permissions:\s*[\s\S]*contents:\s*write/, "release workflow needs contents write permission");
assert.match(workflow, /fetch-depth:\s*0/, "release workflow must fetch tags and commit history");
assert.match(workflow, /actions\/setup-node@v4/, "release workflow must pin Node setup action");
assert.match(workflow, /npm ci/, "release workflow must install from the lockfile");
assert.match(workflow, /scripts\/release-version\.mjs --bump/, "release workflow must classify commit messages");
assert.match(workflow, /scripts\/release-version\.mjs --apply/, "release workflow must apply the calculated version");
assert.match(workflow, /if:\s*steps\.bump\.outputs\.bump != 'none'/, "non-release commits must skip publishing");
assert.match(workflow, /npm run build/, "release workflow must build the extension");
assert.match(workflow, /scripts\/test-release-version\.mjs/, "release workflow must test version logic");
assert.match(workflow, /scripts\/test-release-workflow\.mjs/, "release workflow must test its own contract");
assert.match(workflow, /scripts\/run-tests\.mjs/, "release workflow must run the full test suite");
assert.match(workflow, /zip -r/, "release workflow must package dist");
assert.match(workflow, /gh release create/, "release workflow must publish a GitHub release");
assert.match(workflow, /\[skip ci\]/, "generated release version commit must not loop the workflow");

console.log("PASS: GitHub release workflow covers versioning, build, packaging, and publishing.");
