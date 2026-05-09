/**
 * lib/workflows/provision-server.ts  (Docker backend)
 *
 * Pulls the game image and starts a container on the local machine.
 * No Hetzner, no SSH, no agent — just dockerode.
 */
import { startGameContainer } from "@/lib/docker/runner";
import { env } from "@/lib/env";
import { emitActivity } from "@/lib/events/emit";

import { stepMarkFailed, stepMarkProvisioning, stepMarkReady, stepReadDesiredState } from "./steps";

export const provisionServer = async (input: { serverId: string }) => {
  const { serverId } = input;

  try {
    if ((await stepReadDesiredState(serverId)) === "deleted") return;

    await stepMarkProvisioning(serverId);

    const { hostPort } = await startGameContainer(serverId);

    // The connect IP is the public-facing IP/hostname — use APP_URL's hostname.
    const connectIp = new URL(env.APP_URL).hostname;

    await stepMarkReady(serverId, hostPort, connectIp);

    await emitActivity({
      message: "🎮 Game server is live!",
      phase: "ready",
      serverId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("[provision] failed:", reason);
    await stepMarkFailed({ reason, serverId });
  }
};
