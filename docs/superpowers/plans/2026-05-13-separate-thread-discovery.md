# Separate Thread Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep channel listing fast and move expensive active/archived thread discovery to a separate endpoint loaded asynchronously by the homepage.

**Architecture:** `VoiceController` exposes cache-only channels and network-backed threads separately. `webserver.ts` adds `/api/guilds/:guildId/threads`. `public/index.html` loads channels first, then appends thread options after thread endpoint returns.

**Tech Stack:** TypeScript, discord.js-selfbot-v13, Express, vanilla JS.

---

### Task 1: Add thread discovery method

**Files:**
- Modify: `src/voiceController.ts`

- [ ] Add `listThreads(guildId)` that fetches active and archived threads per parent text channel.
- [ ] Keep `listWatchableChannels` cache-only.
- [ ] Verify typecheck.

### Task 2: Add thread API endpoint

**Files:**
- Modify: `src/webserver.ts`

- [ ] Add `GET /api/guilds/:guildId/threads`.
- [ ] Return thread summaries.
- [ ] Verify typecheck.

### Task 3: Update homepage dropdown loading

**Files:**
- Modify: `public/index.html`

- [ ] `loadChannels` fetches `/channels` first and renders immediately.
- [ ] Then fetches `/threads` async and appends thread options.
- [ ] Verify typecheck/tests.
