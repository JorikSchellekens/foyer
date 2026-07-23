<div align="center">

<img src="public/icon-192.png" alt="Foyer" width="80" height="80" />

# Foyer

**The room where your documents are received.**

Self-hosted document and data room sharing with serious analytics.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/Postgres-Prisma-336791?logo=postgresql&logoColor=white)](https://www.prisma.io)
[![S3 compatible](https://img.shields.io/badge/Storage-S3%20compatible-569A31?logo=amazons3&logoColor=white)](#quick-start-self-hosted)
[![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white)](#quick-start-self-hosted)
[![MCP](https://img.shields.io/badge/API-MCP%20%2B%20REST-175B47)](#mcp)

</div>

---

Foyer is a Papermark-class virtual data room you run yourself: magic-link
auth, branded viewers, granular permissions, NDA gates, per-page reading
time, mouse attention maps, custom domains with Cloudflare
auto-configuration, and MCP and REST APIs. No plan gates, no seat pricing,
no analytics retention limits: you own the database, so everything is
unlimited.

## Features

### Documents
- Upload files or whole folders; previews for PDF, images, video, audio,
  Word, spreadsheets, text and code; public Notion page embeds.
- Versioning with history, restore, and per-version uploader audit.

### Data rooms
- Nested folders, bulk import from the library or straight upload.
- Viewer groups with per-item permissions, Q&A with email notifications.
- Generated table-of-contents PDF and full zip download.

### Links
- Public, email, or verified-email access; personal invite emails with
  per-recipient expiry.
- Passwords, expiration dates, allow and block lists, download control,
  screenshot deterrence, dynamic watermarking.
- NDA agreements with drawn signatures, per-link welcome message and social
  preview, link presets with a team default.

### Analytics
- Per-visit duration, per-page dwell time, completion, downloads, device
  and location.
- Visitor profiles: the full reading history of any email address.
- Cursor attention heatmaps on every page.
- Nothing is ever purged; long retention comes free with owning the data.

### Branding and domains
- Logo, banner, brand and background colors, call-to-action, welcome
  message, custom link previews; per-data-room overrides; one-click
  auto-fill from any website URL.
- Serve links from `dataroom.yourcompany.com`: automatic Cloudflare DNS
  configuration with an API token, or a manual CNAME.

### Teams and integrations
- Multiple workspaces per account, magic-link login, member invites with
  pending management, roles, per-member data room permissions.
- MCP server for Claude and other agents, REST API, HMAC-signed webhooks,
  per-member email notification preferences.

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

Built with Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Postgres via
Prisma, any S3-compatible object store, and Resend for email.

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

| Method | Route | |
| --- | --- | --- |
| `GET` | `/api/v1/documents?q=` | search documents |
| `GET` | `/api/v1/links` | list links |
| `POST` | `/api/v1/links` | create a link |
| `GET` | `/api/v1/views?limit=` | recent visits |

Webhooks are configured in Settings → Webhooks; payloads are signed with
HMAC-SHA256 in `x-foyer-signature`.

## Operations

- `/api/health` reports app and database status; wire it into your uptime
  monitor. The compose healthcheck restarts the app if it degrades.
- Postgres is backed up nightly by the bundled `backup` service into
  `./backups` (14-day rotation). Ship that directory offsite.
- Object storage holds original files only; enable versioning or
  replication on your S3 provider (or `mc mirror` MinIO) for a second copy.
- The app is stateless (cookie-signed sessions, files in S3, state in
  Postgres): run two replicas behind your proxy for zero-downtime deploys.

## Environment reference

See [`.env.example`](.env.example). Everything not marked required has a
sensible default in docker-compose.
