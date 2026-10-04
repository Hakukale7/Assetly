# Assetly — Asset Record Management

Multi-tenant, self-hosted asset management with audit logging, RBAC, barcode scanning, and depreciation tracking. Deploy with Docker Compose in under five minutes.

## Quick Start

```bash
git clone https://github.com/yourorg/assetly.git
cd assetly
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET to strong random values
docker compose up -d --build
```

Open http://localhost:8080.

On first boot, an admin password is generated and printed to the API logs:
```bash
docker compose logs api | grep -A2 "Generated admin password"
```
Log in as `admin@assetly.local` with that password.

## Features

- **Multi-tenant hierarchy** — parent/child companies with recursive scoping
- **Audit log** — append-only, field-level diffs with IP and user agent
- **RBAC** — role-based permissions configurable per company
- **Barcode/QR scanning** — camera-based serial capture on any device
- **CSV / Excel / PDF** — import and export with streaming (memory-safe at 1M+ rows)
- **Depreciation tracking** — straight-line book value on every asset
- **API keys** — for CI pipelines and integrations
- **Webhooks** — HMAC-signed event delivery with retries
- **Google sign-in** — OIDC-based, optional domain restriction
- **Scheduled reports** — weekly email digests
- **Soft delete + restore**
- **QR code generation** for printable labels
- **Dark/light theme**, responsive mobile UI

## Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  nginx   │────▶│  Node    │────▶│ Postgres │
│  (web)   │     │  (api)   │     │  (db)    │
└──────────┘     └──────────┘     └──────────┘
```

Three containers. All state in the `pgdata` volume.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WEB_PORT` | no | Host port for the web UI (default 8080) |
| `DB_PASSWORD` | **yes** | Postgres password |
| `JWT_SECRET` | **yes** | JWT signing secret — 32+ random chars |
| `SEED_ADMIN_PASSWORD` | no | Admin password on first boot (auto-generated if blank) |
| `GOOGLE_CLIENT_ID` | no | Enables Google sign-in |
| `ALLOWED_DOMAINS` | no | Comma-separated domains for Google sign-in |
| `SMTP_*` | no | Enables scheduled email reports |
| `REPORT_RECIPIENTS` | no | Comma-separated emails for weekly reports |

## Development

Backend hot-reloads from `./backend/src` (volume mount).
Frontend rebuilds via `docker compose build web`.

Run migrations manually if you edit `schema.sql`:
```bash
docker compose exec api node -e "import('./src/db.js').then(m => m.pool.query(require('fs').readFileSync('src/schema.sql','utf8')))"
```

## License

MIT — see [LICENSE](./LICENSE).
