# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript source. Main UI is in `src/App.tsx`, styles in `src/App.css` and `src/index.css`.
- `src/services/`: API and sync integrations (`ai.ts`, `auth.ts`, `supabase.ts`, `sync.ts`).
- `public/`: Static assets (icons, etc.).
- `dist/`: Build output (generated).
- Reference docs: `GEMINI.md`, `QUICK_TEST.md`, `TEST_CHECKLIST.md`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start Vite dev server at `http://localhost:5173`.
- `npm run build`: type-check (`tsc`) then build production assets.
- `npm run preview`: serve the production build locally.

## Coding Style & Naming Conventions
- Language: TypeScript + React (function components, hooks).
- Styling: vanilla CSS with CSS variables for theming (`:root`, `[data-theme="dark"]`).
- Indentation: 2 spaces in TS/TSX/CSS.
- Naming: camelCase for variables/functions, PascalCase for components, UPPER_SNAKE_CASE for constants.
- Prefer small helper functions in `App.tsx` rather than deep inline logic.

## Testing Guidelines
- No automated test runner is configured in `package.json`.
- Use the manual smoke tests in `QUICK_TEST.md` and `TEST_CHECKLIST.md`.
- If you add tests later, document how to run them here.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat: ...`, `fix: ...`).
- PRs should include:
  - A short summary and what changed.
  - Manual test notes (reference `QUICK_TEST.md`).
  - UI changes: include before/after screenshots.

## Configuration & Secrets
- Environment variables required for API integrations:
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `VITE_AI_API_KEY`, `VITE_AI_BASE_URL`
- Do not commit real keys; use `.env.local` for local setup.
