import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { loadConfig } from "./config.js";
import { createPostHogClient } from "./posthog-client.js";
import { createITunesClient } from "./ratings/itunes-client.js";
import { createRatingsPoller } from "./ratings/poller.js";
import { createAppStoreClient } from "./reviews/app-store-client.js";
import { createPoller } from "./reviews/poller.js";
import { createJsonWatermarkStore } from "./reviews/watermark.js";
import { createScheduler, type Scheduler } from "./scheduler.js";

const config = loadConfig();

const appStore = createAppStoreClient({
  issuerId: config.ASC_ISSUER_ID,
  keyId: config.ASC_KEY_ID,
  privateKey: config.ASC_PRIVATE_KEY,
  appId: config.ASC_APP_ID,
});

const posthog = createPostHogClient({
  apiKey: config.POSTHOG_API_KEY,
  host: config.POSTHOG_HOST,
});

const watermark = createJsonWatermarkStore(config.WATERMARK_PATH);

const reviewsPoller = createPoller({
  appStore,
  posthog,
  watermark,
  appId: config.ASC_APP_ID,
  backfillDays: config.BACKFILL_DAYS,
});

const reviewsScheduler = createScheduler({
  intervalMs: config.POLL_INTERVAL_MS,
  tick: () => reviewsPoller.run(),
});

const itunes = createITunesClient({ appId: config.ASC_APP_ID });

const ratingsPoller = createRatingsPoller({
  itunes,
  posthog,
  countries: config.RATINGS_COUNTRIES,
});

const ratingsScheduler = createScheduler({
  intervalMs: config.POLL_INTERVAL_MS,
  tick: () => ratingsPoller.run(),
});

const app = new Hono();

app.use(logger());

app.get("/health", (context) => context.json({ status: "ok" }));

app.onError((error, context) => {
  console.error(error);
  return context.json({ error: "Internal server error" }, 500);
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});

reviewsScheduler.start();
ratingsScheduler.start();

async function shutdown(signal: string): Promise<void> {
  console.log({ event: "shutting_down", signal });
  await reviewsScheduler.stop();
  await ratingsScheduler.stop();
  await posthog.shutdown();
  server.close(() => {
    console.log({ event: "shutdown_complete" });
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
