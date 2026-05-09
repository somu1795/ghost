import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import Redis from "ioredis";

// Shared Redis connection for BullMQ.
// BullMQ requires ioredis (not node-redis). We reuse the same REDIS_URL.
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL must be set for BullMQ");
}

const createConnection = () => new Redis(REDIS_URL!, { maxRetriesPerRequest: null });

// ─── Queues ─────────────────────────────────────────────────────
export const provisionQueue = new Queue("ghost:provision-server", {
  connection: createConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const teardownQueue = new Queue("ghost:teardown-server", {
  connection: createConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const snapshotQueue = new Queue("ghost:build-snapshot", {
  connection: createConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// ─── Worker registration ────────────────────────────────────────
// Workers are started in instrumentation.ts when the Next.js server boots.
// We keep the processor imports lazy to avoid loading heavy modules at
// import time.

let workersStarted = false;

export const startWorkers = async () => {
  if (workersStarted) return;
  workersStarted = true;

  const { provisionServer } = await import("@/lib/workflows/provision-server");
  const { teardownServer } = await import("@/lib/workflows/teardown-server");
  const { buildSnapshot } = await import("@/lib/workflows/build-snapshot");

  const provisionWorker = new Worker(
    "ghost:provision-server",
    async (job: Job) => {
      await provisionServer(job.data);
    },
    {
      connection: createConnection(),
      concurrency: 5,
      // Long-running: provisioning can take up to 30 min
      lockDuration: 30 * 60 * 1000,
      lockRenewTime: 60 * 1000,
    }
  );

  const teardownWorker = new Worker(
    "ghost:teardown-server",
    async (job: Job) => {
      await teardownServer(job.data);
    },
    {
      connection: createConnection(),
      concurrency: 5,
      lockDuration: 5 * 60 * 1000,
      lockRenewTime: 30 * 1000,
    }
  );

  const snapshotWorker = new Worker(
    "ghost:build-snapshot",
    async (job: Job) => {
      await buildSnapshot(job.data);
    },
    {
      connection: createConnection(),
      concurrency: 2,
      // Snapshot builds can take up to 60 min
      lockDuration: 60 * 60 * 1000,
      lockRenewTime: 60 * 1000,
    }
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[bullmq] Shutting down workers...");
    await Promise.all([
      provisionWorker.close(),
      teardownWorker.close(),
      snapshotWorker.close(),
    ]);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("[bullmq] Workers started: provision, teardown, snapshot");
};
