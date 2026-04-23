import { z } from "zod";

export const ITunesLookupResultSchema = z
  .object({
    trackName: z.string().optional(),
    version: z.string().optional(),
    averageUserRating: z.number().optional(),
    userRatingCount: z.number().optional(),
    averageUserRatingForCurrentVersion: z.number().optional(),
    userRatingCountForCurrentVersion: z.number().optional(),
  })
  .passthrough();

export const ITunesLookupResponseSchema = z.object({
  resultCount: z.number(),
  results: z.array(ITunesLookupResultSchema),
});

export interface RatingSnapshot {
  appId: string;
  country: string;
  capturedAt: Date;
  trackName: string | null;
  version: string | null;
  averageRating: number | null;
  ratingCount: number;
  averageRatingCurrentVersion: number | null;
  ratingCountCurrentVersion: number;
}
