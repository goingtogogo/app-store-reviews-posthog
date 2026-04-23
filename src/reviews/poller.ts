import type { PostHogClient } from "../posthog-client.js";
import { errorMessage } from "../utils.js";
import type { AppStoreClient } from "./app-store-client.js";
import type { Review } from "./schemas.js";
import {
  resolveSince,
  type Watermark,
  type WatermarkStore,
} from "./watermark.js";

export interface PollResult {
  fetched: number;
  emitted: number;
  skipped: number;
  durationMs: number;
}

export interface PollerDeps {
  appStore: AppStoreClient;
  posthog: PostHogClient;
  watermark: WatermarkStore;
  appId: string;
  backfillDays: number;
}

export interface Poller {
  run(): Promise<PollResult>;
}

export function createPoller(deps: PollerDeps): Poller {
  return {
    async run(): Promise<PollResult> {
      const startedAt = Date.now();

      const state = await deps.watermark.read();
      const since = resolveSince(state, deps.backfillDays);
      const alreadyEmitted = new Set(state.lastSeenIds);

      const { reviews: fetched } = await deps.appStore.fetchReviews({
        since,
        maxPages: 25,
      });

      fetched.sort(
        (a, b) =>
          new Date(a.attributes.createdDate).getTime() -
          new Date(b.attributes.createdDate).getTime(),
      );

      const emittedReviews: Review[] = [];
      let skipped = 0;

      for (const review of fetched) {
        if (alreadyEmitted.has(review.id)) {
          skipped++;
          continue;
        }
        if (emittedReviews.length >= 1000) {
          break;
        }
        deps.posthog.captureReview(review, deps.appId);
        emittedReviews.push(review);
      }

      // Flush before advancing the watermark. `capture()` is fire-and-forget
      // into an in-memory batch; without flushing, a crash would silently
      // drop events and the watermark would move past them.
      let flushed = true;
      try {
        await deps.posthog.flush();
      } catch (error) {
        flushed = false;
        console.error({ event: "posthog_flush_failed", error: errorMessage(error) });
      }

      if (flushed && emittedReviews.length > 0) {
        const next = nextWatermark(state, emittedReviews);
        await deps.watermark.write(next);
      }

      const result: PollResult = {
        fetched: fetched.length,
        emitted: emittedReviews.length,
        skipped,
        durationMs: Date.now() - startedAt,
      };
      console.info({ event: "review_poll_completed", ...result });
      return result;
    },
  };
}

function nextWatermark(previous: Watermark, emitted: Review[]): Watermark {
  const newest = emitted.reduce((a, b) =>
    new Date(a.attributes.createdDate) >= new Date(b.attributes.createdDate)
      ? a
      : b,
  );
  const newestDate = newest.attributes.createdDate;

  const tiedIds = new Set<string>();
  if (previous.lastSeenCreatedDate === newestDate) {
    for (const id of previous.lastSeenIds) tiedIds.add(id);
  }
  for (const review of emitted) {
    if (review.attributes.createdDate === newestDate) {
      tiedIds.add(review.id);
    }
  }

  return {
    lastSeenCreatedDate: newestDate,
    lastSeenIds: [...tiedIds],
  };
}
