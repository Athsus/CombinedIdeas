# Ideas Combine

Ideas Combine is a single React app that hosts multiple small products. The first shipped product is Gomoku.

## Stack

- `Vite`
- `React`
- `TypeScript`
- `Vitest`
- `Supabase` for backend work
- `GitHub Pages` for deployment

## Available Routes

- `/`: product index
- `/gomoku`: playable Gomoku page
- `/study-tools`: study tools hub
- `/study-tools/flash-cards`: upload knowledge sources and generate flash cards

## Scripts

- `npm install`
- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run verify`

## Deployment

This repo includes a GitHub Actions workflow for GitHub Pages deployment. After pushing to your GitHub repository:

1. Set the default branch to `main`.
2. Open repository `Settings -> Pages`.
3. Ensure GitHub Actions can deploy Pages for this repository.
4. Push to `main` to trigger a deployment.

## Supabase Setup

Create a local `.env.local` file with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Run the SQL in `supabase.sql` inside the Supabase SQL Editor before expecting gameplay inserts to work.

## Claude Setup (Study Tools)

Study Tools calls a Supabase Edge Function named `claude-study`, and that function calls Claude.

1. Deploy function:
   - `supabase functions deploy claude-study`
2. Set secrets for the function:
   - `supabase secrets set ANTHROPIC_API_KEY=your_key`
   - Optional model override:
     - `supabase secrets set ANTHROPIC_MODEL=claude-3-7-sonnet-latest`
3. Ensure browser env still has:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

The function source lives at `supabase/functions/claude-study/index.ts`.

## Project Memory

Project context, progress, decisions, and collaboration rules live in `WORKFLOW.md`.
