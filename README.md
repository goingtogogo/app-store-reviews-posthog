# App Store Reviews to Posthog

Pull customer reviews and ratings from the App Store (via App Store Connect API) and forward them to PostHog as events, so this data lives in one place alongside the rest of product analytics.

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  scheduler (every hour)                                     │
│     └─► poller.run()                                        │
│           ├─► watermark.read()         "last seen: 2026-…"  │
│           ├─► appStoreClient.fetch()   ← Apple ASC API      │
│           ├─► posthog.captureReview()  → PostHog capture    │
│           └─► watermark.write()         updates on success  │
└─────────────────────────────────────────────────────────────┘
```

## Setup

1. Generate an App Store Connect API key with the **App Manager** role: https://appstoreconnect.apple.com/access/integrations/api
2. Download the `.p8` file. You'll need the **Key ID**, **Issuer ID**, and the key contents.
3. Get your PostHog project API key: https://eu.posthog.com/settings/project#variables
4. `cp .env.example .env` and fill in the values.
5. `npm install`
6. `npm run dev`

### Pasting the `.p8` key into `.env`

The key spans multiple lines. Paste it with real newlines, wrapped in double quotes:

```bash
ASC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIG...
-----END PRIVATE KEY-----
"
```

## PostHog event shape

### `app_store_review_received`

```
event:       app_store_review_received
distinct_id: app-store-reviewer:<review_id>
timestamp:   <createdDate from Apple>
properties:
  $insert_id:          <review_id>          # dedup key
  app_id, review_id, rating (1-5),
  title, body, reviewer_nickname,
  territory, created_date,
  platform: "ios",
  source:   "app_store_connect_api"
```

Build trends, breakdowns (by rating / territory), or SQL insights on top.

## Limitations

- Single iOS app per process
- Reviews pipeline pulls whatever ASC exposes. If Apple moderates a review out of the feed, this tool won't tombstone previously-emitted events
- No review-reply capture
