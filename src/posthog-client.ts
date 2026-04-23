import { PostHog } from "posthog-node";
import type { RatingSnapshot } from "./ratings/schemas.js";
import type { Review } from "./reviews/schemas.js";
import { errorMessage } from "./utils.js";

export interface PostHogClient {
  captureReview(review: Review, appId: string): void;
  captureRatingSnapshot(snapshot: RatingSnapshot, tickId: string): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface PostHogClientOptions {
  apiKey: string;
  host: string;
}

export function createPostHogClient(opts: PostHogClientOptions): PostHogClient {
  const client = new PostHog(opts.apiKey, { host: opts.host });

  return {
    captureReview(review: Review, appId: string): void {
      client.capture({
        distinctId: `app-store-reviewer:${review.id}`,
        event: "app_store_review_received",
        // Backdate to when the review actually happened, not when we ingested.
        timestamp: new Date(review.attributes.createdDate),
        properties: {
          // PostHog's idempotency key
          $insert_id: review.id,
          app_id: appId,
          review_id: review.id,
          rating: review.attributes.rating,
          title: review.attributes.title,
          body: review.attributes.body,
          reviewer_nickname: review.attributes.reviewerNickname,
          territory: review.attributes.territory,
          created_date: review.attributes.createdDate,
          platform: "ios",
          source: "app_store_connect_api",
        },
      });
    },

    captureRatingSnapshot(snapshot: RatingSnapshot, tickId: string): void {
      client.capture({
        distinctId: `app-store-app:${snapshot.appId}`,
        event: "app_store_rating_snapshot",
        timestamp: snapshot.capturedAt,
        properties: {
          $insert_id: `rating:${snapshot.appId}:${snapshot.country}:${tickId}`,
          app_id: snapshot.appId,
          country: snapshot.country,
          track_name: snapshot.trackName,
          version: snapshot.version,
          average_rating: snapshot.averageRating,
          rating_count: snapshot.ratingCount,
          average_rating_current_version: snapshot.averageRatingCurrentVersion,
          rating_count_current_version: snapshot.ratingCountCurrentVersion,
          captured_at: snapshot.capturedAt.toISOString(),
          tick_id: tickId,
          platform: "ios",
          source: "itunes_lookup_api",
        },
      });
    },

    async flush(): Promise<void> {
      await client.flush();
    },

    async shutdown(): Promise<void> {
      await client.shutdown();
    },
  };
}

export async function safeFlush(posthog: PostHogClient): Promise<boolean> {
  try {
    await posthog.flush();
    return true;
  } catch (error) {
    console.error({
      event: "posthog_flush_failed",
      error: errorMessage(error),
    });
    return false;
  }
}
