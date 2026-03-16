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
- `DEEPSEEK_CHAT_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `GEMINI_CHAT_MODEL`
- `GEMINI_LOG_MODEL`
- `KIMI_API_KEY`
- `KIMI_BASE_URL`
- `KIMI_CHAT_MODEL`
- `KIMI_LOG_MODEL`

Recommended defaults:

```txt
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-chat
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_LOG_MODEL=gemini-2.5-flash
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

Notes:
- Gemini 建议优先使用 `gemini-2.5-flash`。如果要配 3 系列，请使用当前接口支持的模型名；`gemini-3-flash` 这类别名可能会被上游拒绝。
- Kimi 某些模型会限制采样参数，建议先用同一个稳定模型同时填到 `KIMI_CHAT_MODEL` 和 `KIMI_LOG_MODEL`。

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
- `/api/ai/models` exposes only model metadata and capabilities, never secrets.
- Supabase remains directly called from the browser using the public anon key, which is expected for this architecture.
