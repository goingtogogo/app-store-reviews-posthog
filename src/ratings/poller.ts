import { randomUUID } from "node:crypto";
import type { PostHogClient } from "../posthog-client.js";
import { errorMessage } from "../utils.js";
import type { ITunesClient } from "./itunes-client.js";
import type { RatingSnapshot } from "./schemas.js";

export interface RatingsPollResult {
  countriesPolled: number;
  captured: number;
  missing: number;
  failed: number;
  durationMs: number;
  snapshots: RatingSnapshot[];
}

export interface RatingsPollerDeps {
  itunes: ITunesClient;
  posthog: PostHogClient;
  countries: readonly string[];
}

export interface RatingsPoller {
  run(): Promise<RatingsPollResult>;
}

export function createRatingsPoller(deps: RatingsPollerDeps): RatingsPoller {
  return {
    async run(): Promise<RatingsPollResult> {
      const startedAt = Date.now();
      const tickId = randomUUID();
      const snapshots: RatingSnapshot[] = [];
      let missing = 0;
      let failed = 0;

      for (const country of deps.countries) {
        try {
          const snapshot = await deps.itunes.fetchRatingSnapshot(country);
          if (!snapshot) {
            missing++;
            console.warn({ event: "rating_snapshot_not_found", country });
            continue;
          }
          deps.posthog.captureRatingSnapshot(snapshot, tickId);
          snapshots.push(snapshot);
        } catch (error) {
          failed++;
          console.error({ event: "rating_snapshot_failed", country, error: errorMessage(error) });
        }
      }

      try {
        await deps.posthog.flush();
      } catch (error) {
        console.error({ event: "posthog_flush_failed", error: errorMessage(error) });
      }

      const result: RatingsPollResult = {
        countriesPolled: deps.countries.length,
        captured: snapshots.length,
        missing,
        failed,
        durationMs: Date.now() - startedAt,
        snapshots,
      };
      console.info({ event: "ratings_poll_completed", ...result });
      return result;
    },
  };
}
