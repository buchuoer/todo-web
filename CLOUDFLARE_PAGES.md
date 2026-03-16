# Cloudflare Pages Migration

## Build Settings
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Frontend Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Functions Secrets
Set these in Cloudflare Pages -> Settings -> Variables and Secrets -> Production/Preview:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Recommended defaults:

```txt
DEEPSEEK_BASE_URL=https://api.deepseek.com
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

## Local Development
1. Copy `.dev.vars.example` to `.dev.vars` and fill in real secrets.
2. Run `npm run build`.
3. Run `npm run pages:dev`.
4. Open `http://localhost:8788`.

Cloudflare's official Pages docs currently recommend `wrangler pages dev <DIRECTORY-OF-ASSETS>` for local Functions testing, and `_routes.json` can be used to limit invocation to `/api/*`.

## Deploy Notes
1. Create a Pages project with Git integration.
2. Connect this GitHub repository.
3. Set the build settings above.
4. Add the frontend env vars and Functions secrets.
5. Deploy once on a preview branch, verify `/api/ai/*` requests succeed, then promote to production.

## Security Outcome
- Browser bundle no longer contains AI provider API keys.
- AI requests now go through Cloudflare Pages Functions at `/api/ai/*`.
- Supabase remains directly called from the browser using the public anon key, which is expected for this architecture.
