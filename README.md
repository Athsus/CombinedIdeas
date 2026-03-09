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

## Project Memory

Project context, progress, decisions, and collaboration rules live in `WORKFLOW.md`.
