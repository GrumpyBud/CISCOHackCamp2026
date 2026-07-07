# Reflex Console Contributor Guide

Start here when changing this repository. `FILE_GUIDE.md` is the detailed file map; this guide is the working checklist.

## Repo Shape

- Firmware lives at the repository root and in `src/`. `ReflexConsole.ino` is only the Arduino entry point; product behavior belongs in `src/ReflexApp.cpp` and the helpers under `src/core/`.
- The dashboard lives in `dashboard/`. It is a Next.js app with Clerk authentication and Neon/Postgres storage.
- Database setup SQL lives in `dashboard/db/`. Treat `dashboard/db/schema.sql` as the canonical fresh-database schema and `dashboard/db/migrations/` as updates for older databases.
- The Python serial badge exporter is `dashboard/tools/export_badge.py`.
- `simulator/` is legacy, hardware-era code. Do not use it as the source of truth for current firmware or dashboard behavior.

## Setup

Firmware assumptions:

- CUHSP 2021 ESP32 badge or compatible ESP32.
- Arduino-ESP32 3.3.10.
- TFT_eSPI configured as shown in `README.md`.
- Optional sound uses a buzzer wired to GPIO32/TP9 when `ENABLE_BUZZER` is enabled in `src/config/BuildConfig.h`.

Dashboard setup:

```sh
cd dashboard
npm install
cp .env.example .env.local
npm run dev
```

Required dashboard environment variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `RESEARCH_HASH_SALT` is recommended for stable pseudonymous research hashes.

Run `dashboard/db/schema.sql` once against a fresh Neon/Postgres database. For existing databases, apply the numbered migrations in `dashboard/db/migrations/` in order.

## Validation

Dashboard:

```sh
cd dashboard
npm run typecheck
npm run lint
npm run build
```

Firmware:

- Compile the Arduino sketch after changes under `src/`.
- Complete at least the test mode touched by the change on-device.
- For stats/storage changes, verify serial or BLE export still emits `REFLEX_EXPORT` begin/session/end frames.

## Research Data

Research contribution is intentionally enabled by default. The shared `research_sessions` rows store badge session metrics with salted SHA-256 pseudonymous user and badge hashes. They do not copy health check-ins, profile notes, email, name, or Clerk account IDs into research session rows.

Do not describe this as application-level encrypted data unless encryption is actually added. Use precise wording around pseudonymous salted hashes, user-scoped dashboard access, and deployment/database security controls.

## Common Change Locations

- Test flow and summaries: `src/ReflexApp.cpp`.
- Persistent firmware stats: `src/core/Stats.*` and `src/core/Storage.*`.
- Pin and feature flags: `src/config/PinConfig.h` and `src/config/BuildConfig.h`.
- Dashboard UI: `dashboard/src/components/dashboard.tsx` and `dashboard/src/app/globals.css`.
- Dashboard APIs: `dashboard/src/app/api/**/route.ts`.
- Export validation/types: `dashboard/src/lib/export.ts` and `dashboard/src/lib/types.ts`.
- Database shape: `dashboard/db/schema.sql` plus a migration when existing databases need the change.

Generated files such as `reflex-export.json`, `.next/`, `node_modules/`, `*.tsbuildinfo`, `.env.local`, `.vercel/`, and `__pycache__/` should stay untracked.
