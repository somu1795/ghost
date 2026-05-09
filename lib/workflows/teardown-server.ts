/**
 * lib/workflows/teardown-server.ts  (Docker backend)
 *
 * Stops and removes the Docker container for a server.
 */
import { destroyGameServer } from "@/lib/docker/runner";
import { emitActivity } from "@/lib/events/emit";

import { stepMarkDeleted } from "./steps";

export const teardownServer = async (input: { serverId: string }) => {
  const { serverId } = input;

  try {
    await emitActivity({
      message: "Stopping game container",
      phase: "deleting",
      serverId,
    });

    await destroyGameServer(serverId);
    await stepMarkDeleted(serverId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("[teardown] failed:", reason);
    // Still mark deleted so the UI doesn't get stuck.
    await stepMarkDeleted(serverId);
  }
};
