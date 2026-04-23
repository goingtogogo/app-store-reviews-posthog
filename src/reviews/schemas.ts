import { z } from "zod";

export const ReviewSchema = z.object({
  id: z.string(),
  type: z.literal("customerReviews"),
  attributes: z.object({
    rating: z.number().int().min(1).max(5),
    title: z.string().nullable(),
    body: z.string().nullable(),
    reviewerNickname: z.string().nullable(),
    createdDate: z.iso.datetime({ offset: true }),
    territory: z.string(),
  }),
});

export type Review = z.infer<typeof ReviewSchema>;

export const ReviewsResponseSchema = z.object({
  data: z.array(ReviewSchema),
  links: z
    .object({
      next: z.string().optional(),
    })
    .optional(),
});
