# Contributing

Thanks for considering a contribution.

## Dev Setup

1. Clone the repo, `cd` in, copy `.env.example` to `.env`
2. Set `DB_PASSWORD` and `JWT_SECRET`
3. `docker compose up -d --build`
4. Backend auto-reloads from `./backend/src`
5. Frontend: `cd frontend && npm install && npm run dev` (proxies to :4000)

## PR Checklist

- [ ] Code builds (`docker compose build`)
- [ ] No new `console.log` in production paths
- [ ] No hardcoded secrets
- [ ] Schema changes are idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- [ ] New routes use `authOrApiKey` and `can(resource, action)` middleware
- [ ] README updated if behavior changes

## Commit Convention

`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`

## Reporting Bugs

Use the GitHub issue template. Include:
- Reproduction steps
- Expected vs actual
- `docker compose logs api` output
- Browser console errors if frontend
