# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`ck-api` is a REST API server for a Japanese yakiniku (BBQ) restaurant chain's central kitchen order management system (焼肉屋セントラルキッチン 受発注API). Individual restaurant branches place ingredient orders to the central kitchen.

## Commands

```bash
npm run dev       # Start with nodemon (auto-reload)
npm start         # Start production server
npm run seed      # Populate the DB with initial stores and products
```

There is no test suite or linter configured.

The PDF feature requires Python with `reportlab` installed:
```bash
pip install reportlab
```

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — signing key for JWTs
- `NOTIFY_METHOD` — `none` / `email` / `line` / `both`

For email/LINE notifications, set the corresponding `MAIL_*` or `LINE_TOKEN` variables.

## Architecture

### Startup & DB Initialization

`src/index.js` calls `initDb()` (which runs `CREATE TABLE IF NOT EXISTS` for all four tables) then `seedIfEmpty()` (inserts the CK admin and stores if no `ck` role row exists) before starting the HTTP server. The standalone `src/db/seed.js` does the same idempotently and can be run independently.

### Role-Based Access

JWT tokens carry `{ store_id, name, role }`. There are exactly two roles:
- `ck` — central kitchen admin; can read all orders, update order status, manage products and stores
- `store` — individual branch; can only see and create their own orders

The auth middleware (`src/middleware/auth.js`) accepts the token from the `Authorization: Bearer` header or `?token=` query parameter.

### Data Model

Four tables defined inline in `src/db/database.js`:
- `stores` — login accounts for CK and branches
- `products` — ingredient master list; soft-deleted via `active=0` (never hard-deleted)
- `orders` — order header (store, status, delivery_date, notes)
- `order_items` — line items linking orders to products with quantity

Order status flow (enforced by `PATCH /orders/:id/status`, CK only): `pending` → `confirmed` → `preparing` → `delivered` / `cancelled`

### PDF Generation

`GET /orders/:id/pdf` spawns `generate_pdf.py` as a child process (`src/utils/pdfGenerator.js`), pipes JSON to its stdin, and returns the PDF bytes from stdout. The Python script uses `reportlab` and auto-detects a Japanese font from common OS paths (falls back to Helvetica if none found).

### Notifications

`src/utils/notify.js` fires asynchronously after a new order is created (errors are logged but do not fail the request). Supports email via nodemailer and LINE Notify via HTTPS. Controlled entirely by `NOTIFY_METHOD`.

## Deployment

Deployed on Render.com (`render.yaml`). The `nixpacks.toml` configures the build to install `python311` + `reportlab` alongside `npm install`, which is required for PDF generation in the cloud environment.
