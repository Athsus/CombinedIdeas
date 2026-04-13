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
- Testing and verification: `Vitest`, `typecheck`, `verify`
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
- Verified `npm run test` and `npm run typecheck` successfully inside WSL.
- Added client-side Supabase integration for Gomoku session tracking.
- Added `supabase.sql` for the required table and insert policy.
- Added Study Tools hub with iLovePDF-style tool entry cards.
- Added Flash Cards Studio with `txt` / `md` / `docx` uploads and interactive study canvas rendering.
- Added JSON DSL parsing + renderer flow to avoid chat-like UI and render structured outputs.
- Added Supabase Edge Function scaffold for real Claude API calls (`claude-study`).
- Added a protected TODO workspace backed by Supabase Auth with Google OAuth.
- Added production Supabase Auth configuration for GitHub Pages deployment and Google sign-in.
- Added per-user TODO storage with RLS and authenticated-only CRUD.
- Redesigned the TODO route into a standalone Microsoft-style workspace instead of reusing the Gomoku shell.
- Added dynamic document titles by route so the app no longer stays on `Gomoku`.
- Added TODO views for list, board, calendar, gantt, and charts.
- Added filter, sort, search, project grouping, section grouping, goals, and milestones for TODO tasks.
- Added board drag/drop between sections and inline TODO editing.
- Added simple/detailed layout modes for the TODO workspace.
- Added a fixed MCP-style task chat panel to the TODO page for natural-language task operations.
- Added a Supabase Edge Function `todo-agent` for authenticated natural-language TODO CRUD over the current user's data.
- Added Google Calendar sync for TODO tasks with persistent `google_calendar_event_id` tracking in the database.
- Deployed the `todo-agent` Edge Function to the production Supabase project.
- Applied the latest TODO schema updates to the production Supabase database.
- Refactored the TODO area into separate routes for product landing (`/todo`), login (`/todo/login`), and authenticated workspace (`/todo/workspace`).
- Added light/dark theme switching across the TODO landing page, login page, and workspace.
- Shifted the TODO login page toward an Asana-like minimal login layout with a single Google action, divider, email field, and continue button.
- Tightened the TODO landing page into a sparse hero layout with only a top-left theme toggle and minimal copy.
- Standardized TODO dark mode on GitHub-style black (`#0d1117`) and removed the non-TODO outer shell framing from full-page TODO surfaces.
- Reduced the TODO login page scale to a centered medium-width form instead of a near full-width hero layout.
- Fixed Supabase Google OAuth callback handling for `HashRouter` by restoring the target hash route after redirects that return as `?code=...`.
- Isolated OAuth return-route storage by environment URL and made TODO login explicitly return to `#/todo/workspace` instead of inferring from the current page.
- Reworked the TODO workspace toward an Asana-like dark layout with a left sidebar, top search bar, dedicated `Home` and `My tasks` entry points, and project-first navigation.
- Added a reusable front-end toolbar pattern for TODO `search`, `filter`, `sort`, and `group` controls using popover menus.
- Replaced the earlier TODO workspace body with explicit `Home`, `List`, `Board`, `Calendar`, `Dashboard`, and `Files` surfaces under `My tasks` / project views.
- Defined the first-pass TODO dashboard as fixed metrics + section bar chart + completion donut + task timeline, instead of attempting full user-customizable widgets immediately.
- Defined the first-pass TODO files view as task-note/reference entries derived from task details, pending any real upload/attachment system.
- Fixed the TODO sidebar collapse/hide state so collapsed mode also hides the `Create` control and section headings instead of leaving oversized leftover elements.
- Added inline section-level task creation for TODO list groups and board columns so the Asana-like workspace supports quick-add directly inside each group.
- Increased TODO board card information density with checkbox, notes, metadata, and tags to move closer to Asana's board readability.
- Switched TODO narrow-screen sidebar behavior to a topbar hamburger-controlled drawer instead of removing the sidebar from the layout entirely.
- Made TODO tabs and toolbar controls horizontally scrollable on narrow widths so they are not clipped.
- Unified TODO sidebar toggling to a single topbar hamburger interaction; the old in-sidebar `<` / `>` control is removed.
- Restructured the TODO workspace so a compact global topbar sits above the content shell, while the sidebar now starts below that topbar and no longer occupies the full left edge from the top of the viewport.
- Moved TODO workspace secondary actions into a profile dropdown so the topbar now stays limited to the hamburger, search bar, and profile entry.
- Updated the project `dev` script to target `http://localhost:5174` with `--strictPort` so local runs do not silently fall back to `5173`.
- Changed the MCP chat dock to start hidden by default so it no longer covers the TODO workspace until explicitly opened.
- Changed TODO sidebar navigation/project active states to full-row Asana-style highlights instead of rounded button pills.
- Fixed desktop TODO sidebar collapse so the left column fully closes instead of leaving a visible sliver.
- Hardened TODO Supabase integration so missing `todo_projects` support or unreachable `todo-agent` functions produce clear degradations instead of opaque backend errors.
- Hardened TODO workspace bootstrap so task loading and project loading fail independently via `Promise.allSettled`, preventing one backend issue from blanking the whole page.
- Fixed TODO tab and toolbar containers to preserve horizontal scrolling instead of clipping labels such as `Dashboard`, `Group`, or other right-side controls.
- Changed project-loading failure behavior so missing/unavailable `todo_projects` support no longer surfaces `Failed to load projects.` across the main workspace.
- Added a first dedicated `Gantt` view tab for TODO instead of keeping the timeline only inside dashboard cards.
- Flattened TODO board/list presentation further toward Asana, reducing card heaviness and tightening list/table density.
- Reworked the TODO sidebar toward the referenced Asana navigation structure, including grouped sections for `Inbox`, `Insights`, `Projects`, and `Teams`.
- Moved project-only gantt access into the project view tabs so timeline planning reads more like an Asana project surface than a generic personal task page.
- Reworked the TODO board into fixed-width horizontal columns and removed the earlier left-edge urgency stripe from board cards.
- Reworked the TODO gantt layout into a left-label / right-timeline split with a clearer project-style timeline track.
- Replaced the old inline TODO edit form with a right-side slide-out task detail drawer, following the referenced Asana-style edit pattern more closely.

### Next

- TODO: 下一步先去 Claude 里看看它是如何构建这个功能的，然后回来再告诉 Codex 需要怎么做（当前实现不够好，需要按对照结果继续改）。
- Connect this repository to your GitHub account.
- Push the project to your GitHub repository.
- Enable GitHub Pages deployment permissions if needed.
- Run `supabase.sql` in the remote Supabase project if the table does not exist yet.
- Confirm GitHub Pages is enabled for the target repository.
- Expand the TODO Tool toward an Asana-style planning layer after the Microsoft To Do redesign ships:
  - saved views / tabs for list, calendar, gantt, and dashboard
  - sections / board columns and drag-drop workflow stages
  - intake forms that create tasks
  - goals / milestones tied to groups of tasks
  - portfolio view across multiple projects or lists
  - workload / capacity planning by owner and date
  - automation rules for due-soon, section moves, and reminders
  - status updates / progress summaries for plans
- Upgrade `todo-agent` from rule-based parsing to a true LLM-backed task agent if the current deterministic command grammar proves too limited.
- Add Google Calendar OAuth hardening if provider token refresh becomes necessary for long-lived sessions.
- Consider dedicated tables for projects, sections, goals, and ordering if TODO complexity keeps increasing.

## Plans

### Active

- Continue refining the Asana-like TODO workspace after the topbar/sidebar split lands:
  - restyle board cards to match the flatter Asana-style project board look, removing the current Microsoft-like card treatment
  - refine list density, field alignment, and inline task affordances so the list view stops feeling visually off compared with Asana
  - add a dedicated `Gantt` / timeline view rather than keeping timeline only inside dashboard panels
  - implement Asana-like drag editing across board, list, calendar, and gantt where technically reasonable:
    - board drag between sections
    - list drag reorder when not actively sorted
    - calendar drag to reschedule due dates
    - gantt drag to move task bars and resize start/end ranges
  - add an unscheduled task lane for gantt items without dates, following Asana timeline behavior
  - add dependency-aware gantt planning later, after the base timeline interactions are stable
  - section collapse and inline row editing in list view
  - denser board interactions and drag/drop refinements
  - project-level pages and project dashboards
  - dashboard customization after the fixed summary version proves useful
  - real files/attachments instead of note-derived placeholders

### Future

- Explore whether project reminders should escalate into a real digest/reminder system instead of remaining project metadata only.
- Consider dedicated tables for projects, sections, goals, and ordering if TODO complexity keeps increasing.
- Add a reproducible remote Supabase validation path once `supabase login` / `SUPABASE_ACCESS_TOKEN` is available in the working environment; current shell access cannot inspect the linked remote project directly.
- Add dedicated schema support for gantt start dates, duration/range editing, task ordering, and task dependencies once the initial gantt view is in place.

## Decisions

- Use one app with multiple product routes instead of multiple separate apps.
- Keep the project structure minimal until more products exist.
- Use hash-based routing to avoid static hosting route issues on GitHub Pages.
- Use relative Vite asset paths so the app can be served from a repository Pages URL.
- Keep the first product local-first before introducing backend complexity.
- Keep AI-facing project memory in `WORKFLOW.md`; do not write user-facing project docs unless explicitly requested.
- The TODO route is allowed to diverge visually from the rest of the app and should be treated as its own product surface.
- Natural-language TODO operations are currently implemented as an authenticated Supabase Edge Function, not a browser-only parser.
- Google Calendar sync is anchored to the Google OAuth provider token from the authenticated Supabase session.
- TODO full-page surfaces should own the full viewport and not inherit the default app shell margins or beige background.
- TODO dark mode should use GitHub-style black (`#0d1117`) as the page background baseline.
- TODO login should stay minimal and reference the provided Asana-like composition unless the user asks for a different direction.
- For OAuth under `HashRouter`, preserve the desired hash route in local storage before redirect and restore it on callback before the router mounts.
- The preferred local dev URL for this project is currently `http://localhost:5174`, and TODO auth behavior should be tested against that port when Vite lands there.
- The project `dev` script should bind to `http://localhost:5174` with `--strictPort`; do not silently fall back to `5173` or any other port during routine local development.
- TODO workspace information architecture currently centers on `Home`, `My tasks`, and per-project pages; `Inbox` and `Insights` descendants are intentionally deferred.
- TODO `My tasks` should behave as a cross-project personal task organizer and show task metadata such as due date, project, and section.
- TODO `filter`, `sort`, `group`, and `search` should be implemented as reusable front-end patterns so they can be reused across list, board, dashboard, and future project surfaces.
- TODO dashboard should prioritize useful fixed summaries first; customization can be added later and is explicitly deferred for now.
- On narrow screens, TODO navigation should preserve sidebar access through a drawer triggered from the top header, not by hiding navigation with no recovery path.
- TODO horizontal control rows such as tabs and toolbar actions must degrade to horizontal scrolling rather than clipping content.
- TODO sidebar open/close behavior should be driven by a single shared hamburger control, with desktop toggling collapse and narrow screens toggling the drawer.
- Do not run `npm run build` for routine iteration on this project; it is explicitly disallowed due to power usage concerns.
- Do not stop an already-running local dev instance unless the user explicitly asks for it or the work cannot proceed otherwise.
- TODO workspace layout should keep the topbar above the content region, with the sidebar starting below the topbar rather than occupying the full left edge from the top of the viewport.
- TODO topbar should stay compact and only contain the hamburger, search bar, and profile entry; other actions belong in the profile dropdown.
- For TODO UI changes, default self-check should use `npm run typecheck` and `npm test` unless the user explicitly requests something stronger.
- Do not mask real backend failures with local backup/fallback project data; if Supabase is missing schema or auth, surface that fact and fix the real backend.

## Collaboration Rules

- I should read this file before making substantial project changes.
- I should read this file before each implementation pass on this project, not only for large changes.
- This file is maintained by the agent, not manually by the user.
- The user should give instructions that are specific, firm, and clear.
- The user does not need to force bullet-point prompts; natural language is acceptable and the agent should structure the task internally.
- Prefer incremental changes over large rewrites.
- Do not add unnecessary files, tools, or scripts.
- Do not rename files or classes without an explicit reason.
- Record each meaningful product change and each meaningful visual/style direction change in this file after implementing it.

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
- `npm run verify`

If a change is too small for all checks, at least run the narrowest relevant verification.

Recent successful verification for the current TODO workspace/topbar restructure:

- `npm run test`
- `npm run typecheck`

Recent successful verification for the current TODO sidebar/backend hardening pass:

- `npm run test`
- `npm run typecheck`

## Ops Notes

- Prefer `Node` for project-local automation around this app.
- Use `Python` only for lightweight scripts when it is the simplest option.
- Keep the active development environment in WSL when possible.
- Do not store secrets in this file.
- Record reusable commands and stable procedures here after they prove useful.
- For Supabase CLI usage in this repo, prefer `npx supabase ...`.
- Production TODO backend changes may require both `npx supabase db query --linked -f supabase.sql` and `npx supabase functions deploy todo-agent --project-ref kwipkxlhrjbbxsptpwph`.
- For Supabase CLI work in this repo, prefer explicitly loading `.supabase.local.env` before any command so the current shell inherits `SUPABASE_ACCESS_TOKEN` reliably:
  - `set -a && . ./.supabase.local.env && set +a`
  - then run `npx supabase ...`
- Standard TODO backend workflow:
  - `set -a && . ./.supabase.local.env && set +a && export PATH="/home/ya/.nvm/versions/node/v24.14.0/bin:$PATH"`
  - `npx supabase db query --linked -f supabase.sql`
  - `npx supabase functions deploy todo-agent --project-ref kwipkxlhrjbbxsptpwph`
  - optionally verify policies with a small SQL file against `pg_policies`
- Do not rely on interactive `supabase login` alone when `.supabase.local.env` already contains a valid `SUPABASE_ACCESS_TOKEN`; load the env file explicitly to avoid repeating this failure mode.

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
