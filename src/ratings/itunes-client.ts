import { fetchJson } from "../utils.js";
import { ITunesLookupResponseSchema, type RatingSnapshot } from "./schemas.js";

const ITUNES_LOOKUP_BASE = "https://itunes.apple.com/lookup";

export interface ITunesClient {
  /**
   * Returns the rating summary for `appId` in `country`, or `null` if the
   * app isn't available in that storefront.
   */
  fetchRatingSnapshot(country: string): Promise<RatingSnapshot | null>;
}

export interface ITunesClientOptions {
  appId: string;
}

export function createITunesClient(opts: ITunesClientOptions): ITunesClient {
  return {
    async fetchRatingSnapshot(country: string): Promise<RatingSnapshot | null> {
      const url =
        `${ITUNES_LOOKUP_BASE}?id=${encodeURIComponent(opts.appId)}` +
        `&country=${encodeURIComponent(country)}`;

      const raw = await fetchJson(url);
      const parsed = ITunesLookupResponseSchema.parse(raw);
      const result = parsed.results[0];

      if (!result) {
        return null;
      }

      return {
        appId: opts.appId,
        country,
        capturedAt: new Date(),
        trackName: result.trackName ?? null,
        version: result.version ?? null,
        averageRating: result.averageUserRating ?? null,
        ratingCount: result.userRatingCount ?? 0,
        averageRatingCurrentVersion:
          result.averageUserRatingForCurrentVersion ?? null,
        ratingCountCurrentVersion: result.userRatingCountForCurrentVersion ?? 0,
      };
    },
  };
}
