import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const RELEASE_ORDER = { none: 0, patch: 1, minor: 2, major: 3 };
const RELEASE_TYPES = new Map([
  ["feat", "minor"],
  ["fix", "patch"],
  ["perf", "patch"],
]);

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Invalid stable SemVer: ${version}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function classifyCommitMessage(message) {
  const normalized = String(message ?? "").trim();
  const subject = normalized.split(/\r?\n/, 1)[0].trim();
  if (!subject) return "none";

  const breakingFooter = /(?:^|\r?\n)\s*BREAKING[ -]CHANGE\s*:/i.test(normalized);
  const conventional = /^([a-z]+)(?:\([^)]*\))?(!)?:\s+.+$/i.exec(subject);
  if (!conventional) return "none";
  if (conventional[2] || breakingFooter) return "major";
  return RELEASE_TYPES.get(conventional[1].toLowerCase()) ?? "none";
}

export function highestReleaseBump(messages) {
  return messages.reduce((highest, message) => {
    const current = classifyCommitMessage(message);
    return RELEASE_ORDER[current] > RELEASE_ORDER[highest] ? current : highest;
  }, "none");
}

export function bumpVersion(version, bump) {
  const parsed = parseVersion(version);
  if (bump === "major") return `${parsed.major + 1}.0.0`;
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`;
  if (bump === "patch") return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  if (bump === "none") return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  throw new Error(`Unknown release bump: ${bump}`);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch);
}

function runGit(args, cwd = PROJECT_ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function getLatestVersionTag(cwd = PROJECT_ROOT) {
  const tags = runGit(["tag", "--list", "v*", "--sort=-version:refname"], cwd)
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, version: tag.slice(1) }))
    .filter(({ version }) => /^\d+\.\d+\.\d+$/.test(version));
  return tags[0] ?? null;
}

export function getCommitMessagesSinceTag(tag, cwd = PROJECT_ROOT) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = runGit(["log", range, "--format=%B%x00"], cwd);
  return output.split("\0").map((message) => message.trim()).filter(Boolean);
}

export async function getReleasePlan(cwd = PROJECT_ROOT) {
  const packagePath = join(cwd, "package.json");
  const packageData = JSON.parse(await readFile(packagePath, "utf8"));
  const latestTag = getLatestVersionTag(cwd);
  const baseVersion = latestTag && compareVersions(latestTag.version, packageData.version) > 0
    ? latestTag.version
    : packageData.version;
  const messages = getCommitMessagesSinceTag(latestTag?.tag ?? null, cwd);
  const bump = highestReleaseBump(messages);
  return { baseVersion, bump, messages, nextVersion: bumpVersion(baseVersion, bump), latestTag };
}

async function writeVersionedJson(filePath, version) {
  const data = JSON.parse(await readFile(filePath, "utf8"));
  data.version = version;
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function updateVersionFiles(cwd, version, paths = {}) {
  const packagePath = paths.packagePath ?? join(cwd, "package.json");
  const manifestPath = paths.manifestPath ?? join(cwd, "public", "manifest.json");
  await writeVersionedJson(packagePath, version);
  await writeVersionedJson(manifestPath, version);
}

async function main() {
  const command = process.argv[2];
  if (command !== "--bump" && command !== "--apply") {
    throw new Error("Usage: node scripts/release-version.mjs --bump|--apply");
  }

  const plan = await getReleasePlan(PROJECT_ROOT);
  if (command === "--bump") {
    console.log(plan.bump);
    return;
  }
  if (plan.bump === "none") {
    console.log("none");
    return;
  }
  await updateVersionFiles(PROJECT_ROOT, plan.nextVersion);
  console.log(plan.nextVersion);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
