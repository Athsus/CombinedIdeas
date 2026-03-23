# Workflow

## Project

- Name: `Ideas Combine`
- Purpose: host multiple small products in a single frontend app
- Current first product: `Gomoku`
- Product direction: ship small, complete products one by one

## Tech Stack

- Frontend: `Vite + React + TypeScript`
- Routing: `react-router-dom` with `HashRouter`
- Deployment: `GitHub Pages` via GitHub Actions
- Backend: `Supabase`
- Testing and verification: `Vitest`, `typecheck`, `build`, `verify`
- Local runtime: `WSL` with `nvm`, `Node v24.14.0`, `npm 11.9.0`

## Map

- `/`: product index page
- `/gomoku`: first shipped product
- `/study-tools`: study tool hub page
- `/study-tools/flash-cards`: flash card studio (knowledge upload + Claude DSL rendering)
- `src/gomoku.ts`: pure game logic
- `src/gomoku.test.ts`: logic tests
- `.github/workflows/deploy.yml`: GitHub Pages deployment
- `supabase/functions/claude-study/index.ts`: Claude API edge-function bridge for study DSL generation

## Progress

### Done

- Initialized a minimal React + TypeScript frontend foundation.
- Added a playable local-first Gomoku page.
- Added pure logic helpers for winner detection.
- Added a minimal test file for core Gomoku rules.
- Added a GitHub Pages deployment workflow.
- Installed project dependencies inside WSL.
- Verified `npm run test`, `npm run typecheck`, and `npm run build` successfully inside WSL.
- Added client-side Supabase integration for Gomoku session tracking.
- Added `supabase.sql` for the required table and insert policy.
- Added Study Tools hub with iLovePDF-style tool entry cards.
- Added Flash Cards Studio with `txt` / `md` / `docx` uploads and interactive study canvas rendering.
- Added JSON DSL parsing + renderer flow to avoid chat-like UI and render structured outputs.
- Added Supabase Edge Function scaffold for real Claude API calls (`claude-study`).

### Next

- Connect this repository to your GitHub account.
- Push the project to your GitHub repository.
- Enable GitHub Pages deployment permissions if needed.
- Run `supabase.sql` in the remote Supabase project if the table does not exist yet.
- Confirm GitHub Pages is enabled for the target repository.

## Decisions

- Use one app with multiple product routes instead of multiple separate apps.
- Keep the project structure minimal until more products exist.
- Use hash-based routing to avoid static hosting route issues on GitHub Pages.
- Use relative Vite asset paths so the app can be served from a repository Pages URL.
- Keep the first product local-first before introducing backend complexity.

## Collaboration Rules

- I should read this file before making substantial project changes.
- This file is maintained by the agent, not manually by the user.
- The user should give instructions that are specific, firm, and clear.
- The user does not need to force bullet-point prompts; natural language is acceptable and the agent should structure the task internally.
- Prefer incremental changes over large rewrites.
- Do not add unnecessary files, tools, or scripts.
- Do not rename files or classes without an explicit reason.

## Instruction Template

Use this when giving new tasks:

- `Goal`: what should be done
- `Scope`: what can be changed
- `Constraints`: what must not change
- `Inputs`: files, docs, services, or links to use
- `Execution`: whether commands, Git, or remote services are allowed
- `Done When`: what counts as complete

## Verification

After meaningful changes, prefer running:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run verify`

If a change is too small for all checks, at least run the narrowest relevant verification.

## Ops Notes

- Prefer `Node` for project-local automation around this app.
- Use `Python` only for lightweight scripts when it is the simplest option.
- Keep the active development environment in WSL when possible.
- Do not store secrets in this file.
- Record reusable commands and stable procedures here after they prove useful.

## Services

### GitHub

- Target: your own GitHub repository
- Repository URL: `https://github.com/Athsus/CombinedIdeas`
- Deployment: GitHub Pages from the built `dist` output through GitHub Actions
- Requirement: repository must allow Pages deployment through Actions

### Supabase

- Role: database and backend services for product data
- Project ref: `kwipkxlhrjbbxsptpwph`
- Project URL: `https://kwipkxlhrjbbxsptpwph.supabase.co`
- Initial likely use cases:
  - game records
  - player profiles or guest sessions
  - gameplay statistics
  - future product data shared across small apps
- First Gomoku tracking candidates:
  - game start
  - game finish
  - winner
  - move count
  - duration
  - board size
  - client timestamp

### Required Supabase Secrets Later

Frontend local env is configured with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If server-side privileged work is ever needed, confirm separately before using a server-only key:

- `SUPABASE_SERVICE_ROLE_KEY`

Never write the real secret values into this file or bundle them into client code.

## Notes For Future Memory Updates

Add new entries here when they are likely to matter again:

- stable project decisions
- deployment details
- successful verification commands
- Supabase schema or auth decisions
- product roadmap changes
