# Lovable export — Comic Strip Editor

Snapshot copied from Lovable project `d0ce0440-140e-4cf2-aedc-90144db63190` at commit `9a17c55514011afc42700093da34b655d7d3c84e` on 2026-10-24 (JST) so the code survives cancelling the Lovable subscription.
This repo was NOT created via Lovable's GitHub sync; files were copied one by one through the Lovable API.

- Lovable editor: https://lovable.dev/projects/d0ce0440-140e-4cf2-aedc-90144db63190
- Published URL: https://editor.thetinywisdom.com
- Files in Lovable project: 114 (4 binary)

## Binary files not recoverable through the API
- none

## Excluded (large third-party / regenerable data)
- none

## Lovable-hosted assets (`*.asset.json`) — downloaded copies
The `*.asset.json` files point at Lovable's CDN (`/__l5e/assets-v1/...`), which only works on Lovable hosting.
The real files were downloaded next to each json (same name without `.asset.json`). After leaving Lovable, change imports to use those files directly.
- `src/assets/Comico-Regular.woff`
- `src/assets/logotype.svg`

## Things that do NOT move with this code
- **Supabase (Lovable Cloud) database, auth users, storage, edge functions deployment and secrets** live in Lovable's Supabase project. Export data/schema before cancelling, or create your own Supabase project and run the migrations.
- **Secrets / env vars** (names only; values are not in this repo except the public publishable keys in `.env`): see list below.
- **Hosting**: `*.lovable.app` / custom domain hosting stops; redeploy (e.g. Vercel/Netlify/Cloudflare) and repoint DNS. GitHub Pages for this repo is documented in the README. It does not change this Lovable project or `editor.thetinywisdom.com`.
- `@lovable.dev/*` npm packages are public on npmjs and keep working; `bun.lock` may reference Lovable's private npm cache — delete it and reinstall if install fails.
