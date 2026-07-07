[README.md](https://github.com/user-attachments/files/29738487/README.md)
# Prediction-Site
# FULLTIME — Premier League Predictions

Score-prediction game. 3 points for the exact score, 1 for the correct result, 0 otherwise. Overall leaderboard plus private friends leagues with join codes.

## Stack

- React 18 + Vite
- Tailwind CSS 3
- Storage: `src/storage.js` adapter — localStorage in the MVP, designed to be swapped for Supabase (`supabase/schema.sql`) without changing `App.jsx`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

## Test mode

`TEST_MODE = true` in `src/App.jsx` skips login and signs you in as `Tester` with admin rights. Set to `false` to enable the name + PIN login flow.

## Current limitations (MVP)

- localStorage backend: data lives on one device only. Multi-user requires the Supabase migration.
- Fixtures and results are entered manually via the Admin tab.
- Name + 4-digit PIN auth is placeholder-grade. Production uses Supabase Auth.
- Prize pot is a manually set display value; no payments.

## Roadmap

1. **Supabase**: apply `supabase/schema.sql`, replace `src/storage.js` internals with Supabase queries, switch auth to Supabase Auth. This makes the app genuinely multi-user.
2. **Fixture automation**: sync fixtures/results from a football API (`fixtures.external_ref` is reserved for this) so no admin data entry is needed.
3. **Payments**: Stripe Checkout → `entries` table → pot → `payouts` at season end. Blocked on regulatory review: pooled entry-fee competitions with cash payouts fall within the scope of the Gambling Regulation Act 2024 (Ireland) and likely require GRAI licensing. Free entry with a sponsored prize does not.

## Deploy

Static build, so any static host works:

- **Vercel**: `vercel` in repo root, or import the GitHub repo at vercel.com — auto-detects Vite.
- **Netlify**: build command `npm run build`, publish directory `dist`.
- **Cloudflare Pages**: framework preset "Vite".
