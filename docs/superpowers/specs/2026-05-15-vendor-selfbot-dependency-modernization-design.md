# Vendor Selfbot Dependency Modernization Design

## Goal

Modernize `/mnt/code/bete/vendor/discord.js-selfbot-v13` aggressively by auditing runtime dependencies and replacing the legacy development toolchain with Biome, matching the root project style.

## Scope

This work targets the vendored `discord.js-selfbot-v13` submodule only, plus root lockfile/workspace updates required for the root app to consume it. The root app behavior and public import surface should remain compatible with the existing `discord.js-selfbot-v13` API.

## Approach

Audit all vendor `dependencies` and `devDependencies` against actual usage in `src`, `typings`, config files, and package scripts. Classify each package as keep, upgrade, remove, or replace. Apply changes aggressively, but only when usage evidence supports the change.

Replace the vendor's ESLint, Prettier, TSLint, and dtslint-based workflow with Biome. Keep TypeScript validation. Keep `tsd` only if the vendor has type assertion tests that `tsc --noEmit` cannot cover.

## Toolchain Design

Vendor scripts should use Biome for linting and formatting:

- `lint`: `biome check . --diagnostic-level=error`
- `format`: `biome format --write .`
- `test:typescript`: `tsc --noEmit` plus `tsd` only if type assertion tests exist
- `test`: run lint and TypeScript validation

Remove deprecated or redundant dev dependencies after scripts no longer reference them:

- `eslint`
- `eslint-config-prettier`
- `eslint-plugin-import`
- `eslint-plugin-prettier`
- `prettier`
- `tslint`
- `dtslint`

Add `@biomejs/biome` to the vendor dev dependencies unless the workspace can reliably use the root Biome package for the vendor scripts.

## Runtime Dependency Design

Runtime dependencies are reviewed one by one. Candidate packages include:

- `find-process`
- `tree-kill`
- `prism-media`
- `werift-rtp`
- `fetch-cookie`
- `tough-cookie`
- `qrcode`
- `otplib`
- `ws`
- `undici`
- `discord-api-types`
- `@discordjs/builders`
- `@discordjs/collection`
- `@sapphire/async-queue`
- `@sapphire/shapeshift`

For each dependency, search source usage before changing it. Remove unused packages. Upgrade packages that remain used. Replace packages when Node 20+ or a smaller maintained package covers the same use case without changing public behavior.

## Validation

Validation must run in both vendor and root contexts:

1. Vendor dependency install/update.
2. Vendor lint with Biome.
3. Vendor TypeScript/type validation.
4. Root `pnpm install` to refresh workspace lockfile.
5. Root `pnpm run typecheck`.
6. Root `pnpm run lint`.
7. Import smoke check from the root app to ensure `discord.js-selfbot-v13` still resolves through the workspace link.

## Stop Rules

Stop and ask before making a change that would intentionally alter the public `discord.js-selfbot-v13` API, require ESM-only migration for the library entrypoint, or remove a runtime feature that the root app could use.

If a dependency upgrade requires broad internal rewrites, document the blocker and present options instead of forcing a risky migration.
