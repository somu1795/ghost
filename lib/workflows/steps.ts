/**
 * lib/workflows/steps.ts  (Docker backend)
 *
 * All Hetzner-specific steps have been removed.  Game servers now run as
 * Docker containers on the local machine.
 */
import { ulid } from "ulid";

import { prisma } from "@/lib/db";
import { emitActivity } from "@/lib/events/emit";
import type { Phase } from "@/protocol";

// ─── State helpers ───────────────────────────────────────────────────────────

export const stepReadDesiredState = async (serverId: string) => {
  const server = await prisma.server.findUnique({
    select: { desiredState: true },
    where: { id: serverId },
  });
  if (!server) return "deleted" as const;
  return server.desiredState as "running" | "stopped" | "deleted";
};

export const stepReadPhase = async (
  serverId: string
): Promise<Phase | null> => {
  const server = await prisma.server.findUnique({
    select: { phase: true },
    where: { id: serverId },
  });
  return (server?.phase as Phase | undefined) ?? null;
};

// ─── Provision steps ─────────────────────────────────────────────────────────

export const stepMarkProvisioning = async (serverId: string) => {
  await prisma.server.update({
    data: { observedState: "provisioning", phase: "provisioning" },
    where: { id: serverId },
  });
  await emitActivity({
    message: "Starting game container",
    phase: "provisioning",
    serverId,
  });
};

export const stepMarkReady = async (
  serverId: string,
  hostPort: number,
  connectIp: string
) => {
  await prisma.server.update({
    data: {
      observedState: "running",
      phase: "ready",
      ipv4: connectIp,
      hostPort,
    },
    where: { id: serverId },
  });
  await emitActivity({
    message: `Server ready — connect to ${connectIp}:${hostPort}`,
    metadata: { connectIp, hostPort },
    phase: "ready",
    serverId,
  });
};

export const stepMarkFailed = async (input: {
  serverId: string;
  reason: string;
}) => {
  await prisma.server.update({
    data: { errorReason: input.reason, observedState: "failed" },
    where: { id: input.serverId },
  });
  await emitActivity({
    message: `Provision failed: ${input.reason}`,
    metadata: { reason: input.reason },
    phase: "errored",
    serverId: input.serverId,
  });
};

// ─── Teardown steps ──────────────────────────────────────────────────────────

export const stepMarkDeleted = async (serverId: string) => {
  await prisma.server.update({
    data: {
      deletedAt: new Date(),
      observedState: "deleted",
      phase: "deleted",
      hostPort: null,
    },
    where: { id: serverId },
  });
  await emitActivity({
    message: "Server deleted",
    phase: "deleted",
    serverId,
  });
};

// ─── Types ───────────────────────────────────────────────────────────────────
export type WaitPhaseTarget = Phase | Phase[];

// Keep ulid import used to silence linters (used in future steps if needed)
const _noop = ulid;
void _noop;
