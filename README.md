# Foyer

**The room where your documents are received.**

Self-hosted document and data room sharing with serious analytics: magic-link
auth, branded viewers, granular permissions, NDA gates, per-page reading time,
mouse attention maps, custom domains with Cloudflare auto-configuration, MCP
and REST APIs.

Built with Next.js 16, Postgres (Prisma), any S3-compatible storage, and
Resend for email.

---

## Features

- **Documents**: upload files or whole folders, PDF/image/video/audio/Word/
  spreadsheet/text previews, public Notion page embeds, versioning with
  history, restore, and per-version uploader audit.
- **Data rooms**: nested folders, bulk import from the library or straight
  upload, viewer groups with per-item permissions, Q&A with email
  notifications, generated table-of-contents PDF, full zip download.
- **Links**: public / email / verified-email access, personal invite emails
  with per-recipient expiry, passwords, expiration dates, allow & block
  lists, download control, screenshot deterrence, dynamic watermarking,
  NDA agreements with drawn signatures, per-link welcome message and social
  preview, link presets with a team default.
- **Analytics**: per-visit duration, per-page dwell time, completion,
  downloads, device and location, visitor profiles (the full reading
  history of any email), and cursor attention heatmaps.
- **Branding**: logo, banner, brand and background colors, call-to-action,
  welcome message, custom link previews; per-data-room overrides; one-click
  auto-fill from any website URL.
- **Teams**: multiple workspaces per account, magic-link login, member
  invites with pending management, roles, per-member data room permissions.
- **Custom domains**: serve links from dataroom.yourcompany.com; automatic
  Cloudflare DNS configuration with an API token, or manual CNAME.
- **Integrations**: MCP server for Claude and other agents, REST API,
  HMAC-signed webhooks, email notification preferences per member.

## Quick start (self-hosted)

```bash
cp .env.example .env
# set AUTH_SECRET (e.g. `openssl rand -base64 32`), NEXT_PUBLIC_APP_URL,
# RESEND_API_KEY and EMAIL_FROM

docker compose up -d --build
```

The app migrates its own database on boot and is up at `:3000`. Put any
TLS-terminating proxy in front (Caddy, Traefik, nginx, or a Cloudflare
Tunnel) and point `NEXT_PUBLIC_APP_URL` at the public URL.

Sign in at `/login`: with no `RESEND_API_KEY` set, magic links are printed
to the app container logs, which is enough to bootstrap an admin locally.

## Local development

```bash
bun install
docker compose -f docker-compose.dev.yml up -d   # Postgres :5433 + MinIO :9002
bunx prisma migrate dev
bun dev
```

## Custom domains

1. Settings → Custom domains → add `dataroom.yourcompany.com`.
2. Either paste a Cloudflare API token (Zone → DNS → Edit) and Foyer creates
   the proxied CNAME for you, or create it yourself:
   `CNAME dataroom.yourcompany.com → <your app host>`.
3. Press verify. Links on that domain serve the viewer only; the dashboard
   stays on your primary host.

With Cloudflare proxying enabled the edge certificate is issued
automatically. For bare CNAMEs, terminate TLS for the domain at your proxy.

## MCP

Settings → API & MCP → create a key, then:

```json
{
  "mcpServers": {
    "foyer": {
      "url": "https://foyer.yourcompany.com/api/mcp/mcp",
      "headers": { "Authorization": "Bearer foyer_..." }
    }
  }
}
```

Tools: `list_documents`, `list_datarooms`, `list_links`, `create_link`,
`get_link_analytics`, `list_visitors`, `get_visitor_activity`,
`invite_recipients`.

## REST API

Bearer-auth with the same keys:

- `GET  /api/v1/documents?q=`
- `GET  /api/v1/links` / `POST /api/v1/links`
- `GET  /api/v1/views?limit=`

Webhooks are configured in Settings → Webhooks; payloads are signed with
HMAC-SHA256 in `x-foyer-signature`.

## Uptime & data retention

- `/api/health` reports app + database status; wire it into your uptime
  monitor and the compose healthcheck restarts the app if it degrades.
- Postgres is backed up nightly by the bundled `backup` service into
  `./backups` (14-day rotation). Ship that directory offsite.
- Object storage holds original files only; enable versioning/replication on
  your S3 provider (or `mc mirror` MinIO) for a second copy.
- Analytics are never purged: view, page-dwell and attention data are kept
  indefinitely (2-year+ retention comes free with owning the database).
- Run two app replicas behind your proxy for zero-downtime deploys; the app
  is stateless (sessions are cookie-signed, files in S3, state in Postgres).

## Environment reference

See `.env.example`. Everything not marked required has a sensible default in
docker-compose.

## Deployment

Live at https://foyer.boop.it (Coolify on boop-dev, autodeploys from `main`).
