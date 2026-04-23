import { errorMessage } from "./utils.js";

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface SchedulerOptions {
  intervalMs: number;
  tick: () => Promise<unknown>;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<unknown> | null = null;
  let stopping = false;

  async function tickOnce(): Promise<void> {
    if (stopping || inFlight) return;
    inFlight = (async () => {
      try {
        await opts.tick();
      } catch (error) {
        console.error({ event: "scheduler_tick_failed", error: errorMessage(error) });
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  }

  return {
    start(): void {
      console.info({ event: "scheduler_started", intervalMs: opts.intervalMs });
      void tickOnce();
      timer = setInterval(() => {
        void tickOnce();
      }, opts.intervalMs);
    },

    async stop(): Promise<void> {
      stopping = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (inFlight) {
        await inFlight;
      }
      console.info({ event: "scheduler_stopped" });
    },
  };
}
