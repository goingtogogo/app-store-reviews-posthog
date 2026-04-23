import { z } from "zod";

const ConfigSchema = z.object({
  ASC_ISSUER_ID: z.uuid(),
  ASC_KEY_ID: z.string(),
  ASC_PRIVATE_KEY: z.string(),
  ASC_APP_ID: z.string(),

  POSTHOG_API_KEY: z.string(),
  POSTHOG_HOST: z.url(),

  POLL_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(60 * 60_000),
  BACKFILL_DAYS: z.coerce.number().int().nonnegative().default(90),
  WATERMARK_PATH: z.string().default("./data/watermark.json"),

  RATINGS_COUNTRIES: z
    .string()
    .default("us")
    .transform((value) => value.split(",")),

  PORT: z.coerce.number().default(3000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
