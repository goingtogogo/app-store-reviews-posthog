import { safeFlush, type PostHogClient } from "../posthog-client.js";
import type { AppStoreClient } from "./app-store-client.js";
import type { Review } from "./schemas.js";
import {
  resolveSince,
  type Watermark,
  type WatermarkStore,
} from "./watermark.js";

const MAX_PAGES_PER_RUN = 25;
const MAX_REVIEWS_PER_RUN = 1000;

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
        maxPages: MAX_PAGES_PER_RUN,
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
        if (emittedReviews.length >= MAX_REVIEWS_PER_RUN) {
          break;
        }
        deps.posthog.captureReview(review, deps.appId);
        emittedReviews.push(review);
      }

      const flushed = await safeFlush(deps.posthog);

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
  const newestDate = emitted[emitted.length - 1]!.attributes.createdDate;
  const tiedIds = new Set<string>(
    previous.lastSeenCreatedDate === newestDate ? previous.lastSeenIds : [],
  );
  for (const r of emitted) {
    if (r.attributes.createdDate === newestDate) tiedIds.add(r.id);
  }
  return { lastSeenCreatedDate: newestDate, lastSeenIds: [...tiedIds] };
}
