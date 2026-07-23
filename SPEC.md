# Foyer — self-hosted dataroom & document sharing

Internal tool for Boop. Papermark-class feature set, no plan gates. Everything unlimited.

## Stack
- Next.js 16 App Router (src/), TypeScript, Tailwind v4, shadcn/ui (radix, nova preset)
- Postgres via Prisma; S3-compatible storage (MinIO for self-host, R2/S3 in prod)
- Resend for all email (magic links, invites, notifications)
- Runtime: Bun for dev tooling; Node runtime in production container
- Self-host: docker-compose (app + postgres + minio), /api/health, backup guidance

## Design language
- Name: **Foyer** — the room where visitors are received.
- Palette: paper `#FAFAF8`, ink `#16181D`, hairline `#E7E6E0`, accent library-green `#175B47`,
  muted warm gray `#6B6F76`, destructive oxblood `#93321F`. Dark tokens mirrored.
- Type: Geist Sans (UI), Newsreader (display: headings, viewer front pages, wordmark italic),
  Geist Mono (numbers, durations, analytics).
- Signature: dot-leader "table of contents" rows (book-index motif) for file lists in
  datarooms and the viewer; mono-set reading-time stats.

## Domain model (Prisma)
User, Session(JWT cookie, no table), VerificationToken (login + viewer verify + direct invites),
Team, TeamMember(role OWNER/ADMIN/MEMBER), TeamInvite,
Folder (team library, nested), Document, DocumentVersion (fileKey, numPages, uploader),
Dataroom, DataroomFolder (nested), DataroomDocument (ordering),
Link (target document OR dataroom; slug; domain; access controls),
LinkPermission (per-link file/folder grants when not sharing entire dataroom),
ViewerGroup + ViewerGroupMember (dataroom groups) + group permissions,
LinkRecipient (direct email invites w/ expiry tokens),
Viewer (email identity per team), View (session), PageView (per-page duration),
MouseBatch (sampled mouse paths per page, JSONB),
Agreement (NDA: embedded field placement / link / text) + AgreementResponse (signature),
SignatureRequest (e-sign envelope: pinned DocumentVersion, lifecycle draft/sent/completed/
declined/voided/expired, serial routing, reminders/expiry) + Signer (tokenized links,
adopted signature/initials PNGs) + SignatureField (pct-rect per signer:
signature/initials/date/text/checkbox) + SigningEvent (append-only audit trail),
Branding (team-level + per-dataroom override; auto-fill from website),
Domain (custom domains, Cloudflare auto-config),
LinkPreset (defaults for new links), NotificationPreference, Notification,
ApiToken (API/MCP/CLI), Webhook + deliveries, DataroomQuestion (Q&A).

## Link access modes
- PUBLIC — anyone with link
- EMAIL — must enter email (unverified)
- EMAIL_VERIFIED — must verify email via magic link OTP
- Direct email invites (LinkRecipient) with per-recipient expiring tokens
Plus: password, expiry date, allow/block list (emails + domains), download on/off,
screenshot deterrence, dynamic watermark (email + timestamp overlay), NDA gate,
custom welcome/branding/link-preview per link, notify-on-access toggle.

## Viewer (/view/[slug], custom domains rewrite via middleware Host check)
Access gates in order: password → email/verification → allow/block → NDA → content.
Document viewer: pdf.js paged reader (tracks page + dwell), images, video/audio,
docx (mammoth), xlsx/csv (SheetJS), md/txt/code, Notion links (react-notion-x).
Dataroom viewer: branded front page (banner/logo/welcome), dot-leader index,
folder navigation, per-file open. Downloads (file + full dataroom zip) when allowed.
Tracking: heartbeat 5s (sendBeacon on hide), per-page dwell, throttled mouse samples
batched to /api/view/track. Watermark overlay when enabled.

## Analytics
Per document: views, unique visitors, avg/total time, per-page dwell bars, completion.
Per link: table like documents. Per visitor (email): document/lastViewed/timeSpent/visits
table (the NA example in brief). Mouse heatmap overlay per page. 2y+ retention (no purge).

## Team & settings
Multi-team accounts, invites (pending management), roles, granular per-resource member
permissions for datarooms. Settings: branding (auto-fill from URL, logo/banner, colors,
CTA, welcome, custom link preview), domains (Cloudflare auto-config w/ API token, else
manual CNAME + TXT verify), agreements builder (PDF upload → field placement → embedded
signing; pdf-lib stamps signed copy), notifications matrix, link presets, API tokens,
webhooks (document.viewed, dataroom.visited, link.created, agreement.signed…).

## MCP (/api/mcp, Bearer ApiToken)
Tools: list/search documents & datarooms, create/manage links, get analytics
(document/link/visitor), invite recipients, list visits.

## Status
- [x] Scaffold (Next 16, Tailwind 4, shadcn radix/nova)
- [x] Schema + migrations (prisma 6, initial migration applied)
- [x] Auth (magic link; dev mode logs links when RESEND_API_KEY unset)
- [x] Storage + uploads (presigned PUT, folder upload w/ tree mirroring)
- [x] Team/onboarding/invites (+ pending invite management, roles)
- [x] Documents + versions (restore, uploader audit, pdf page counting)
- [x] Datarooms + granular link/group permissions + viewer groups
- [x] Links + presets + direct email recipients w/ expiring tokens
- [x] Viewer + gates (password/email/verified/NDA) + signature pad
- [x] Tracking (heartbeat, per-page dwell, mouse batches) + analytics
      + attention heatmaps (visitor > visit detail)
- [x] Branding (auto-fill from URL) + domains (Cloudflare auto CNAME, DoH verify)
- [x] Notifications matrix + webhooks (HMAC) + dataroom Q&A
- [x] MCP (/api/mcp/mcp, Bearer ApiToken) + REST /api/v1/*
- [x] Docker self-host (compose w/ nightly pg backups) + README
- [x] Request-origin URLs everywhere (works on any host/port; env var is
      fallback for out-of-request contexts only)
- [x] Preview presets (Settings → Link previews): named social cards with a
      team default; per-link preset select + inline overrides incl. image.
      OG resolution: link fields → link preset → default preset → branding
- [x] Analytics cross-linking: views tables row-click → /views/[id] detail
      (per-page dwell + attention maps, works for anonymous visits),
      "Viewed" → document/dataroom page, link name → public link URL
- [x] Dataroom explorer: admin tree pane beside contents (navigate, drag
      files/folders into folders/crumbs/root, cycle-safe folder moves);
      viewer tree sidebar on the index page and collapsible in-document
      contents panel (grant-filtered via viewableTree)
- [x] E-signing (DocuSign-style, phase 1): /signatures dashboard + per-document
      "Request signatures"; field-placement editor (click-to-place, drag,
      resize on a pct-rect overlay over react-pdf; per-recipient colors);
      no-account signer flow via tokenized email links (/sign/t/<token> ->
      fs_ session cookie), adopt-signature dialog (type in script face / draw),
      ESIGN consent, decline; engine in lib/signing.ts (serial or parallel
      routing, remind, void, expiry cron at /api/cron/signatures); completion
      stamps values via lib/stamp.ts (pdf-lib), appends a certificate of
      completion (signers, IP/UA, event trail), records SHA-256, emails all
      parties; signature.* webhooks + notifications; lib/stamp.ts sealPdf() is
      the PAdES-sealing extension point. E2E: scripts/sign-e2e.ts

## Known cut corners (candidates for later)
- Agreement "field placement on PDF" simplified to read-PDF + drawn signature
  (no drag-drop field designer); signed copy not yet stamped into a PDF.
  The signing engine (sign-fields/stamp/pdf-field-canvas/adopt-signature) now
  exists - unifying the NDA gate onto it is signing phase 2.
- Signing phase 2+: signer email OTP UI (schema ready: requireEmailVerification
  + SIGNER_VERIFY), reminder/expiry UI toggles (cron endpoint ships), upload-
  signature tab, CC management UI, templates, bulk send, PAdES sealing via
  sealPdf() with a team cert, /api/v1 + MCP signature tools.
- pptx has no inline preview (download only).
- Dataroom viewer renders full nested index on one page (no folder paging).
- file_uploaded notification key exists but no viewer-upload/file-request flow.
