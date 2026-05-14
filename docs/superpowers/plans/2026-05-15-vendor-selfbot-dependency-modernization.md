# Vendor Selfbot Dependency Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggressively modernize the vendored `discord.js-selfbot-v13` dependency by replacing its legacy toolchain with Biome and auditing runtime dependencies without changing the public API used by the root app.

**Architecture:** The vendor submodule remains a CommonJS package exported from `vendor/discord.js-selfbot-v13/src/index.js`. Tooling moves to Biome plus TypeScript/tsd validation, while runtime dependencies are changed only after usage evidence from `src`, `typings`, config, and scripts. Root workspace resolution remains `workspace:*` and is validated from the root after vendor changes.

**Tech Stack:** Node.js >=20.18, pnpm workspaces, Biome, TypeScript, tsd, CommonJS, git submodule.

---

## File Structure

- Modify: `vendor/discord.js-selfbot-v13/package.json` for scripts and dependencies.
- Create: `vendor/discord.js-selfbot-v13/biome.json` for vendor-specific Biome scope.
- Remove: `vendor/discord.js-selfbot-v13/.eslintrc.json`, `vendor/discord.js-selfbot-v13/.prettierrc.json`, `vendor/discord.js-selfbot-v13/tslint.json` after scripts no longer reference them.
- Modify: `vendor/discord.js-selfbot-v13/tsconfig.json` only if modern TypeScript validation requires config compatibility.
- Modify: `vendor/discord.js-selfbot-v13/src/**/*.js` only for required runtime dependency replacements or Biome-safe formatting fixes.
- Modify: `vendor/discord.js-selfbot-v13/typings/**/*.d.ts` only for TypeScript/tsd compatibility.
- Modify: `pnpm-lock.yaml` by running pnpm from the root, not by hand.
- Do not modify root app source files unless validation proves a compatibility issue from the vendor API.

### Task 1: Capture baseline and dependency usage evidence

**Files:**
- Read: `vendor/discord.js-selfbot-v13/package.json`
- Read: `vendor/discord.js-selfbot-v13/src/**/*.js`
- Read: `vendor/discord.js-selfbot-v13/typings/**/*.d.ts`

- [ ] **Step 1: Capture current vendor dependency lists**

Run:

```bash
node - <<'NODE'
const pkg = require('./vendor/discord.js-selfbot-v13/package.json');
console.log('dependencies');
for (const name of Object.keys(pkg.dependencies || {}).sort()) console.log(`${name} ${pkg.dependencies[name]}`);
console.log('devDependencies');
for (const name of Object.keys(pkg.devDependencies || {}).sort()) console.log(`${name} ${pkg.devDependencies[name]}`);
NODE
```

Expected: prints the current runtime and dev dependency names and versions.

- [ ] **Step 2: Capture runtime usage map**

Run:

```bash
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = 'vendor/discord.js-selfbot-v13';
const deps = [
  '@discordjs/builders',
  '@discordjs/collection',
  '@sapphire/async-queue',
  '@sapphire/shapeshift',
  'discord-api-types',
  'fetch-cookie',
  'find-process',
  'otplib',
  'prism-media',
  'qrcode',
  'tough-cookie',
  'tree-kill',
  'undici',
  'werift-rtp',
  'ws',
];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|ts|d\.ts|json)$/.test(full)) files.push(full);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'typings'));
for (const dep of deps) {
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(`require('${dep}`) || text.includes(`require("${dep}`) || text.includes(`from '${dep}`) || text.includes(`from "${dep}`)) hits.push(file);
  }
  console.log(`${dep}: ${hits.length ? hits.join(', ') : 'UNUSED'}`);
}
NODE
```

Expected usage classification based on current code:

```text
@discordjs/builders: vendor/discord.js-selfbot-v13/src/util/Formatters.js, vendor/discord.js-selfbot-v13/src/managers/ApplicationCommandManager.js, vendor/discord.js-selfbot-v13/typings/index.d.ts
@discordjs/collection: many src files and typings/index.d.ts
@sapphire/async-queue: vendor/discord.js-selfbot-v13/src/rest/RequestHandler.js
@sapphire/shapeshift: vendor/discord.js-selfbot-v13/src/structures/interfaces/TextBasedChannel.js
discord-api-types: vendor/discord.js-selfbot-v13/src/client/websocket/WebSocketManager.js, vendor/discord.js-selfbot-v13/typings/index.d.ts, vendor/discord.js-selfbot-v13/typings/rawDataTypes.d.ts
fetch-cookie: vendor/discord.js-selfbot-v13/src/rest/RESTManager.js
find-process: vendor/discord.js-selfbot-v13/src/client/voice/receiver/Recorder.js
otplib: vendor/discord.js-selfbot-v13/src/client/Client.js
prism-media: vendor/discord.js-selfbot-v13/src/client/voice/util/PlayInterface.js, vendor/discord.js-selfbot-v13/src/client/voice/player/MediaPlayer.js, vendor/discord.js-selfbot-v13/src/client/voice/receiver/Receiver.js
qrcode: vendor/discord.js-selfbot-v13/src/util/RemoteAuth.js
tough-cookie: vendor/discord.js-selfbot-v13/src/rest/RESTManager.js
tree-kill: vendor/discord.js-selfbot-v13/src/client/voice/receiver/Recorder.js
undici: vendor/discord.js-selfbot-v13/src/rest/APIRequest.js, vendor/discord.js-selfbot-v13/src/rest/RESTManager.js, vendor/discord.js-selfbot-v13/src/util/RemoteAuth.js, vendor/discord.js-selfbot-v13/src/util/Util.js, vendor/discord.js-selfbot-v13/src/util/DataResolver.js
werift-rtp: vendor/discord.js-selfbot-v13/src/client/voice/receiver/PacketHandler.js, vendor/discord.js-selfbot-v13/src/client/voice/receiver/Recorder.js
ws: vendor/discord.js-selfbot-v13/src/WebSocket.js, vendor/discord.js-selfbot-v13/src/util/RemoteAuth.js
```

- [ ] **Step 3: Confirm type assertion tests exist**

Run:

```bash
find vendor/discord.js-selfbot-v13 -maxdepth 3 -type f -name '*.test-d.ts' -print
```

Expected output includes:

```text
vendor/discord.js-selfbot-v13/typings/index.test-d.ts
```

Decision: keep `tsd` because `typings/index.test-d.ts` exists.

### Task 2: Replace vendor lint and format toolchain with Biome

**Files:**
- Modify: `vendor/discord.js-selfbot-v13/package.json`
- Create: `vendor/discord.js-selfbot-v13/biome.json`
- Remove: `vendor/discord.js-selfbot-v13/.eslintrc.json`
- Remove: `vendor/discord.js-selfbot-v13/.prettierrc.json`
- Remove: `vendor/discord.js-selfbot-v13/tslint.json`

- [ ] **Step 1: Update vendor scripts and dev dependencies**

Edit `vendor/discord.js-selfbot-v13/package.json` so `scripts` becomes:

```json
{
  "all": "npm run build && npm publish",
  "test": "npm run lint && npm run test:typescript && npm run docs:test",
  "fix:all": "npm run format",
  "test:typescript": "tsc --noEmit && tsd",
  "lint": "biome check . --diagnostic-level=error",
  "format": "biome format --write .",
  "docs": "docgen --source src --custom docs/index.yml --output docs/main.json",
  "docs:test": "docgen --source src --custom docs/index.yml",
  "build": "npm run format && npm run docs"
}
```

In the same file, remove these dev dependencies:

```json
"dtslint": "^4.2.1",
"eslint": "^8.39.0",
"eslint-config-prettier": "^8.8.0",
"eslint-plugin-import": "^2.27.5",
"eslint-plugin-prettier": "^4.2.1",
"prettier": "^2.8.8",
"tslint": "^6.1.3"
```

Add this dev dependency if it is not already present in the vendor package:

```json
"@biomejs/biome": "latest"
```

Keep these dev dependencies:

```json
"@discordjs/docgen": "^0.11.1",
"@types/debug": "^4.1.12",
"@types/node": "^22.10.7",
"@types/ws": "^8.5.10",
"patch-package": "^8.0.0",
"tsd": "^0.32.0",
"typescript": "^5.5.4"
```

Expected: no package scripts reference `eslint`, `prettier`, `tslint`, or `dtslint`.

- [ ] **Step 2: Create vendor Biome config**

Create `vendor/discord.js-selfbot-v13/biome.json` with:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.8/schema.json",
  "files": {
    "includes": ["src/**/*.js", "typings/**/*.ts", "*.json"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": false,
      "style": {
        "useNodejsImportProtocol": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  }
}
```

Expected: vendor can run its own Biome config without relying on the root config.

- [ ] **Step 3: Remove legacy config files**

Run:

```bash
rm vendor/discord.js-selfbot-v13/.eslintrc.json vendor/discord.js-selfbot-v13/.prettierrc.json vendor/discord.js-selfbot-v13/tslint.json
```

Expected: the files are removed because no script references those tools.

- [ ] **Step 4: Verify legacy tool references are gone from package scripts**

Run:

```bash
node - <<'NODE'
const pkg = require('./vendor/discord.js-selfbot-v13/package.json');
const scripts = JSON.stringify(pkg.scripts || {});
for (const tool of ['eslint', 'prettier', 'tslint', 'dtslint']) {
  if (scripts.includes(tool)) throw new Error(`legacy tool still referenced: ${tool}`);
}
console.log('legacy script references removed');
NODE
```

Expected output:

```text
legacy script references removed
```

### Task 3: Modernize runtime and dev dependency ranges with usage evidence

**Files:**
- Modify: `vendor/discord.js-selfbot-v13/package.json`
- Modify: `pnpm-lock.yaml` after root install

- [ ] **Step 1: Update used runtime dependencies to current compatible ranges**

Edit `vendor/discord.js-selfbot-v13/package.json` dependencies to these ranges unless a package manager reports a direct incompatibility during install:

```json
{
  "@discordjs/builders": "^1.13.0",
  "@discordjs/collection": "^2.1.1",
  "@sapphire/async-queue": "^1.5.5",
  "@sapphire/shapeshift": "^4.0.0",
  "discord-api-types": "^0.38.38",
  "fetch-cookie": "^3.1.0",
  "find-process": "^2.0.0",
  "otplib": "^12.0.1",
  "prism-media": "^2.0.0-alpha.0",
  "qrcode": "^1.5.4",
  "tough-cookie": "^5.1.2",
  "tree-kill": "^1.2.2",
  "undici": "^7.16.0",
  "werift-rtp": "^0.8.4",
  "ws": "^8.20.0"
}
```

Expected: no runtime dependency is removed yet because all are currently used by source or typings.

- [ ] **Step 2: Update vendor dev dependency ranges**

Edit `vendor/discord.js-selfbot-v13/package.json` devDependencies to:

```json
{
  "@biomejs/biome": "latest",
  "@discordjs/docgen": "^0.11.1",
  "@types/debug": "^4.1.12",
  "@types/node": "^25.8.0",
  "@types/ws": "^8.18.1",
  "patch-package": "^8.0.1",
  "tsd": "^0.33.0",
  "typescript": "^5.9.3"
}
```

Expected: legacy lint/format/type-lint packages are absent.

- [ ] **Step 3: Refresh root workspace lockfile**

Run from `/mnt/code/bete`:

```bash
pnpm install
```

Expected: install completes and `pnpm-lock.yaml` updates the vendor importer dependency ranges.

- [ ] **Step 4: Verify removed dev packages are no longer vendor dependencies**

Run:

```bash
node - <<'NODE'
const pkg = require('./vendor/discord.js-selfbot-v13/package.json');
const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
for (const name of ['dtslint', 'eslint', 'eslint-config-prettier', 'eslint-plugin-import', 'eslint-plugin-prettier', 'prettier', 'tslint']) {
  if (name in all) throw new Error(`legacy package still present: ${name}`);
}
console.log('legacy packages removed');
NODE
```

Expected output:

```text
legacy packages removed
```

### Task 4: Run vendor validation and make Biome-safe fixes

**Files:**
- Modify: `vendor/discord.js-selfbot-v13/src/**/*.js` only if Biome emits errors.
- Modify: `vendor/discord.js-selfbot-v13/typings/**/*.d.ts` only if TypeScript or tsd emits errors.
- Modify: `vendor/discord.js-selfbot-v13/biome.json` only if the configured scope is wrong.

- [ ] **Step 1: Run vendor Biome check**

Run:

```bash
pnpm --filter discord.js-selfbot-v13 run lint
```

Expected: either passes, or reports concrete Biome diagnostics in vendor files.

- [ ] **Step 2: Apply Biome formatting if lint reports formatting diagnostics**

Run only if Step 1 reports formatting diagnostics:

```bash
pnpm --filter discord.js-selfbot-v13 run format
pnpm --filter discord.js-selfbot-v13 run lint
```

Expected: formatting diagnostics are fixed. If lint still reports correctness errors, fix only the reported vendor lines without changing behavior, then rerun lint.

- [ ] **Step 3: Run vendor TypeScript/type validation**

Run:

```bash
pnpm --filter discord.js-selfbot-v13 run test:typescript
```

Expected: `tsc --noEmit && tsd` passes. If it fails due dependency type changes, fix typings or dependency ranges while preserving public API, then rerun.

- [ ] **Step 4: Run vendor test script**

Run:

```bash
pnpm --filter discord.js-selfbot-v13 run test
```

Expected: vendor test script passes. If `docs:test` fails due docgen compatibility unrelated to dependency modernization, record the error and run lint + `test:typescript` as the required validation gate.

### Task 5: Validate root workspace integration

**Files:**
- Modify: `pnpm-lock.yaml` only via pnpm.
- Read: root `package.json`, `src/**/*.ts`.

- [ ] **Step 1: Verify workspace dependency link**

Run:

```bash
pnpm list discord.js-selfbot-v13 --depth 0
```

Expected output includes:

```text
discord.js-selfbot-v13 link:vendor/discord.js-selfbot-v13
```

- [ ] **Step 2: Run root typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: TypeScript exits successfully.

- [ ] **Step 3: Run root lint**

Run:

```bash
pnpm run lint
```

Expected: Biome checks root files successfully. If it scans nested generated worktrees under `.claude/worktrees`, remove only session-generated agent worktrees after confirming they are not needed, then rerun lint.

- [ ] **Step 4: Run root import smoke check**

Run:

```bash
node - <<'NODE'
const selfbot = require('discord.js-selfbot-v13');
for (const key of ['Client', 'Collection', 'WebSocket']) {
  if (!(key in selfbot)) throw new Error(`missing export: ${key}`);
}
console.log('selfbot exports available');
NODE
```

Expected output:

```text
selfbot exports available
```

### Task 6: Review submodule and root diffs

**Files:**
- Review: `vendor/discord.js-selfbot-v13/package.json`
- Review: `vendor/discord.js-selfbot-v13/biome.json`
- Review: removed legacy config files
- Review: `pnpm-lock.yaml`
- Review: root submodule gitlink

- [ ] **Step 1: Review vendor status**

Run:

```bash
git -C vendor/discord.js-selfbot-v13 status --short
git -C vendor/discord.js-selfbot-v13 diff -- package.json biome.json tsconfig.json src typings .eslintrc.json .prettierrc.json tslint.json
```

Expected: vendor changes are limited to toolchain config, package metadata, lock-relevant dependency ranges, and any validation-driven source/typing fixes.

- [ ] **Step 2: Review root status**

Run:

```bash
git status --short
git diff -- package.json pnpm-workspace.yaml pnpm-lock.yaml .gitmodules docs/superpowers/specs/2026-05-15-vendor-selfbot-dependency-modernization-design.md docs/superpowers/plans/2026-05-15-vendor-selfbot-dependency-modernization.md
git diff --submodule
```

Expected: root changes include the existing submodule/workspace setup, this spec/plan, lockfile refresh, and the updated submodule gitlink. Existing unrelated `README.md` remains untouched.

- [ ] **Step 3: Do not push or commit without explicit user permission**

No commit, push, PR, or submodule remote update should run unless the user explicitly asks. If asked, commit inside the vendor submodule first, push that commit, then update the root submodule gitlink and commit root changes separately.

## Self-Review

- Spec coverage: the plan covers runtime dependency audit, Biome-only vendor toolchain, TypeScript/tsd validation, root install/typecheck/lint, and import smoke check.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: all paths use `vendor/discord.js-selfbot-v13`, scripts use `biome`, `tsc`, and `tsd`, and the root dependency remains `workspace:*`.
