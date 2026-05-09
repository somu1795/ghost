import { init } from "@sentry/nextjs";

import { env } from "@/lib/env";

const opts = {
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
};

export const register = async () => {
  if (env.NEXT_RUNTIME === "nodejs") {
    init(opts);
    
    // Start BullMQ workers (only in node.js runtime, not edge)
    const { startWorkers } = await import("@/lib/queue");
    await startWorkers();
  }
};
