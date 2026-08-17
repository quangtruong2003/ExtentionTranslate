# GitHub Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every push to `main` with a release-worthy Conventional Commit automatically bump the extension version, build the Chrome package, and publish a GitHub Release.

**Architecture:** A small Node script owns Conventional Commit classification, SemVer bumping, and synchronized updates to `package.json` and `public/manifest.json`. A GitHub Actions workflow checks out full history and tags, runs the script, commits the generated version bump with `[skip ci]`, builds `dist`, creates a ZIP, tags the release, and uploads the ZIP to GitHub. Non-release commits (`docs`, `chore`, `test`, `ci`, and unrecognized subjects) run no release.

**Tech Stack:** Node.js ESM, npm, GitHub Actions, GitHub CLI, Vite, Chrome Manifest V3.

## Global Constraints

- Preserve existing unstaged feature/UI changes; stage only CI/CD files and their tests/documentation.
- Use Conventional Commits: breaking changes => major, `feat` => minor, `fix`/`perf` => patch, and `docs`/`chore`/`test`/`ci`/`style`/`build` => no release.
- Keep `package.json` and `public/manifest.json` versions synchronized.
- Release only from pushes to `main`; do not release pull-request workflows.
- Do not add a second release when the generated version-bump commit contains `[skip ci]`.

---

### Task 1: Add tested Conventional Commit and SemVer logic

**Files:**
- Create: `scripts/release-version.mjs`
- Create: `scripts/test-release-version.mjs`
- Modify: `package.json` (register `test:release-version`)

**Interfaces:**
- Produces `classifyCommitMessage(message) -> "major" | "minor" | "patch" | "none"`.
- Produces `highestReleaseBump(messages) -> "major" | "minor" | "patch" | "none"`.
- Produces `bumpVersion(version, bump) -> semver string`.
- CLI `--bump` prints the computed bump for commits since the latest `v*` tag.
- CLI `--apply` updates both version files using the computed release version.

- [ ] **Step 1: Write the failing test**

Cover breaking footer and `!` syntax, feature/minor, fix/perf/patch, ignored commit types, malformed subjects, highest-bump selection, and synchronized version-file update in a temporary copy or by testing pure functions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types scripts/test-release-version.mjs`

Expected: FAIL because `scripts/release-version.mjs` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement strict subject matching for Conventional Commit types, breaking detection from `!` and `BREAKING CHANGE:`, SemVer parsing/incrementing, and a CLI that reads Git commit messages since the newest version tag. `--apply` must write the calculated version to the package and manifest without touching unrelated JSON fields.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types scripts/test-release-version.mjs`

Expected: all release-version assertions pass.

- [ ] **Step 5: Commit**

Commit only the script, its test, and the package script registration with:

```text
feat: add conventional commit release versioning
```

### Task 2: Add the GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/RELEASING.md`

**Interfaces:**
- Workflow trigger: push to `main` and manual `workflow_dispatch`.
- Job permissions: `contents: write`.
- Release artifact: `ExtentionTranslate-v<version>.zip` containing the built `dist` directory contents.
- Generated release tag/title: `v<version>`.

- [ ] **Step 1: Write the failing workflow contract test**

Extend `scripts/test-release-version.mjs` or add `scripts/test-release-workflow.mjs` to assert the workflow has full checkout history, Node setup, `npm ci`, the release-version command, `npm run build`, ZIP creation, tag/release creation, `contents: write`, and a guard for `bump == none`.

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `node --experimental-strip-types scripts/test-release-workflow.mjs`

Expected: FAIL because `.github/workflows/release.yml` does not exist yet.

- [ ] **Step 3: Write the minimal workflow and documentation**

The workflow must fetch tags, calculate the bump, stop cleanly for `none`, apply the version, commit `chore(release): v<version> [skip ci]`, build, package `dist`, push the generated commit and tag, then run `gh release create` with generated notes and the ZIP. Document the supported commit types and the resulting version bump in Vietnamese/English concise terms.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `node --experimental-strip-types scripts/test-release-workflow.mjs`

Expected: all workflow contract assertions pass.

- [ ] **Step 5: Commit**

Commit only the workflow and release documentation with:

```text
ci: publish extension releases from main
```

### Task 3: Verify the complete release path and publish

**Files:**
- Inspect: `.github/workflows/release.yml`, `scripts/release-version.mjs`, `package.json`, `public/manifest.json`

- [ ] **Step 1: Run the full test suite**

Run every `test:*` script declared in `package.json`, then run `npm run build`.

- [ ] **Step 2: Inspect the generated artifact**

Verify `dist/manifest.json` exists, its version matches `package.json`, all manifest icons exist, and a local ZIP can be created from `dist`.

- [ ] **Step 3: Review scope and commit history**

Run `git diff --check`, `git status --short`, and inspect staged files. Confirm unrelated unstaged feature/UI changes are not staged.

- [ ] **Step 4: Push the intended commits**

Push the CI/CD commits and existing committed project changes to `origin/main` only after the checks pass. Do not push unstaged changes.

- [ ] **Step 5: Verify the remote workflow and release**

Use `gh run list` and `gh run watch` for the pushed commit, then inspect `gh release view v<version>` and confirm the ZIP asset is attached.

