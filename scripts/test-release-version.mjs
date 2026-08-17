import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bumpVersion,
  classifyCommitMessage,
  highestReleaseBump,
  updateVersionFiles,
} from "./release-version.mjs";

assert.equal(classifyCommitMessage("feat: add AI chat"), "minor");
assert.equal(classifyCommitMessage("feat(settings): add reasoning controls"), "minor");
assert.equal(classifyCommitMessage("fix: stop duplicate requests"), "patch");
assert.equal(classifyCommitMessage("perf: batch stream updates"), "patch");
assert.equal(classifyCommitMessage("feat!: replace the popup contract"), "major");
assert.equal(classifyCommitMessage("refactor(api)!: replace the provider adapter"), "major");
assert.equal(classifyCommitMessage("feat: replace the provider\n\nBREAKING CHANGE: old payloads are removed"), "major");
assert.equal(classifyCommitMessage("docs: explain releases"), "none");
assert.equal(classifyCommitMessage("chore: refresh dependencies"), "none");
assert.equal(classifyCommitMessage("test: cover the parser"), "none");
assert.equal(classifyCommitMessage("Improve popup spacing"), "none");

assert.equal(highestReleaseBump(["docs: update guide", "fix: handle empty response"]), "patch");
assert.equal(highestReleaseBump(["fix: handle empty response", "feat: add vocabulary"]), "minor");
assert.equal(highestReleaseBump(["feat: add vocabulary", "fix!: change storage contract"]), "major");
assert.equal(highestReleaseBump(["docs: update guide", "chore: refresh dependencies"]), "none");

assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
assert.equal(bumpVersion("1.2.3", "none"), "1.2.3");

const fixtureDir = await mkdtemp(join(tmpdir(), "extention-translate-release-"));
try {
  await writeFile(join(fixtureDir, "package.json"), '{\n  "name": "fixture",\n  "version": "1.2.3"\n}\n');
  await writeFile(join(fixtureDir, "package-lock.json"), '{\n  "name": "fixture",\n  "version": "1.2.3",\n  "packages": {"": {"version": "1.2.3"}}\n}\n');
  await writeFile(join(fixtureDir, "public-manifest.json"), '{\n  "manifest_version": 3,\n  "version": "1.2.3"\n}\n');
  await updateVersionFiles(fixtureDir, "1.3.0", {
    packagePath: join(fixtureDir, "package.json"),
    manifestPath: join(fixtureDir, "public-manifest.json"),
  });
  assert.equal(JSON.parse(await readFile(join(fixtureDir, "package.json"), "utf8")).version, "1.3.0");
  const lockfile = JSON.parse(await readFile(join(fixtureDir, "package-lock.json"), "utf8"));
  assert.equal(lockfile.version, "1.3.0");
  assert.equal(lockfile.packages[""].version, "1.3.0");
  assert.equal(JSON.parse(await readFile(join(fixtureDir, "public-manifest.json"), "utf8")).version, "1.3.0");
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}

console.log("PASS: Conventional Commits map to safe synchronized SemVer releases.");
