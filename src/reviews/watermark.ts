import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * The watermark remembers the last review processed, so each poll only fetches new ones.
 */
const WatermarkSchema = z.object({
  lastSeenCreatedDate: z.iso.datetime({ offset: true }).nullable(),
  lastSeenIds: z.array(z.string()).default([]),
});

export type Watermark = z.infer<typeof WatermarkSchema>;

export interface WatermarkStore {
  read(): Promise<Watermark>;
  write(watermark: Watermark): Promise<void>;
}

export function resolveSince(
  watermark: Watermark,
  backfillDays: number,
): Date | null {
  if (watermark.lastSeenCreatedDate) {
    return new Date(watermark.lastSeenCreatedDate);
  }
  if (backfillDays > 0) {
    return new Date(Date.now() - backfillDays * 24 * 60 * 60_000);
  }
  return null;
}

export function createJsonWatermarkStore(path: string): WatermarkStore {
  return {
    async read(): Promise<Watermark> {
      try {
        const raw = await readFile(path, "utf8");
        return WatermarkSchema.parse(JSON.parse(raw));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { lastSeenCreatedDate: null, lastSeenIds: [] };
        }
        throw error;
      }
    },

    async write(watermark: Watermark): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(watermark, null, 2) + "\n");
    },
  };
}
