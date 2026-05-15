# Discord Video Stream Vendor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@dank074/discord-video-stream` as a vendored workspace dependency backed by the SSH submodule remote `ssh://git@43.134.105.109:22222/exceed/Discord-video-stream.git`.

**Architecture:** Follow the existing `discord.js-selfbot-v13` pattern: keep third-party source under `vendor/`, track it as a git submodule, include it in `pnpm-workspace.yaml`, and consume it from the root app with `workspace:*`. Clone from the public GitHub repository for source availability, then set `.gitmodules` to the requested SSH mirror URL so future submodule operations use the private remote.

**Tech Stack:** Git submodules, pnpm workspaces, Node.js package metadata, TypeScript project verification.

---

## File Structure

- Modify `.gitmodules`: add `vendor/Discord-video-stream` submodule entry with SSH URL.
- Create submodule path `vendor/Discord-video-stream`: checkout public upstream `https://github.com/Discord-RE/Discord-video-stream.git` at current `master` HEAD.
- Modify `pnpm-workspace.yaml`: add `vendor/Discord-video-stream` to workspace packages.
- Modify `package.json`: add root dependency `"@dank074/discord-video-stream": "workspace:*"`.
- Modify `pnpm-lock.yaml`: update lockfile after `pnpm install`.

## Task 1: Add Vendor Submodule

**Files:**
- Modify: `.gitmodules`
- Create: `vendor/Discord-video-stream`

- [ ] **Step 1: Verify vendor path does not already exist**

Run:

```bash
test ! -e vendor/Discord-video-stream
```

Expected: exit code `0`. If it exists, stop and inspect it with `git status --short vendor/Discord-video-stream` before proceeding.

- [ ] **Step 2: Add the submodule from public source**

Run:

```bash
git submodule add https://github.com/Discord-RE/Discord-video-stream.git vendor/Discord-video-stream
```

Expected: Git creates `vendor/Discord-video-stream` and updates `.gitmodules`.

- [ ] **Step 3: Set submodule URL to requested SSH mirror**

Run:

```bash
git config -f .gitmodules submodule.vendor/Discord-video-stream.url ssh://git@43.134.105.109:22222/exceed/Discord-video-stream.git
git submodule sync vendor/Discord-video-stream
```

Expected: `.gitmodules` contains:

```ini
[submodule "vendor/Discord-video-stream"]
	path = vendor/Discord-video-stream
	url = ssh://git@43.134.105.109:22222/exceed/Discord-video-stream.git
```

- [ ] **Step 4: Verify package identity**

Run:

```bash
node -e "const p=require('./vendor/Discord-video-stream/package.json'); console.log(p.name)"
```

Expected output:

```text
@dank074/discord-video-stream
```

- [ ] **Step 5: Commit submodule metadata only when requested**

Do not commit unless the user explicitly asks. This session's user has asked to implement but has not asked for a commit for this task.

## Task 2: Wire pnpm Workspace Dependency

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add workspace package path**

Modify `pnpm-workspace.yaml` to exactly:

```yaml
packages:
  - .
  - vendor/discord.js-selfbot-v13
  - vendor/Discord-video-stream

onlyBuiltDependencies:
  - '@discordjs/opus'
  - better-sqlite3
  - esbuild
```

- [ ] **Step 2: Add root dependency**

In `package.json`, add dependency under `dependencies`:

```json
"@dank074/discord-video-stream": "workspace:*"
```

Keep alphabetical-ish placement with scoped packages near the top, for example after `"@discordjs/voice"`.

- [ ] **Step 3: Install and update lockfile**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates and root dependency resolves to `link:vendor/Discord-video-stream`.

- [ ] **Step 4: Verify workspace resolution**

Run:

```bash
pnpm list @dank074/discord-video-stream --depth 0
```

Expected output includes:

```text
@dank074/discord-video-stream link:vendor/Discord-video-stream
```

## Task 3: Verify Project Health

**Files:**
- No new files unless fixes are required.

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm run test
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect final status**

Run:

```bash
git status --short
git submodule status
```

Expected: root status shows `.gitmodules`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `vendor/Discord-video-stream` as changed/added. Submodule status includes `vendor/Discord-video-stream` at the checked-out commit.

## Self-Review

- Spec coverage: submodule creation is Task 1; workspace dependency wiring is Task 2; verification is Task 3.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: package name `@dank074/discord-video-stream`, path `vendor/Discord-video-stream`, and SSH URL are consistent across all tasks.
