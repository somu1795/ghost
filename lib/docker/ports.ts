/**
 * lib/docker/ports.ts
 *
 * Allocates host-side ports for game containers.
 *
 * Port ranges per game:
 *   minecraft         : 25565–25665 (tcp)
 *   valheim           : 2456–2555   (udp, range of 3 per server → 33 servers)
 *   palworld          : 8211–8310   (udp)
 *   enshrouded        : 15636–15735 (udp)
 *   vrising           : 9876–9975   (udp)
 *   rust              : 28015–28114 (udp)
 *   terraria          : 7777–7876   (tcp)
 *   satisfactory      : 7777–7876   (udp) — same numeric range but different from terraria
 *   cs2               : 27015–27114 (udp)
 *   dontstarvetogether: 10998–11097 (udp)
 *
 * We store allocations in the DB (Server.hostPort) so they survive restarts.
 */
import { prisma } from "@/lib/db";

interface PortRange {
  start: number;
  end: number;
  protocol: "tcp" | "udp";
  /** How many consecutive host ports does one server occupy? */
  stride: number;
}

const PORT_RANGES: Record<string, PortRange> = {
  minecraft: { end: 25665, protocol: "tcp", start: 25565, stride: 1 },
  valheim: { end: 2655, protocol: "udp", start: 2456, stride: 3 },
  palworld: { end: 8310, protocol: "udp", start: 8211, stride: 1 },
  enshrouded: { end: 15735, protocol: "udp", start: 15636, stride: 1 },
  vrising: { end: 9977, protocol: "udp", start: 9876, stride: 2 },
  rust: { end: 28114, protocol: "udp", start: 28015, stride: 1 },
  terraria: { end: 7876, protocol: "tcp", start: 7777, stride: 1 },
  satisfactory: { end: 15000, protocol: "udp", start: 15000, stride: 1 },
  cs2: { end: 27114, protocol: "udp", start: 27015, stride: 1 },
  dontstarvetogether: { end: 11097, protocol: "udp", start: 10998, stride: 1 },
};

/**
 * Allocate the next free host port for a game server and persist it on the
 * Server row. Returns the allocated base port.
 *
 * Uses a DB-level unique constraint to handle concurrent allocations safely.
 */
export const allocatePort = async (
  serverId: string,
  game: string
): Promise<number> => {
  // If already allocated, return it.
  const existing = await prisma.server.findUnique({
    select: { hostPort: true },
    where: { id: serverId },
  });
  if (existing?.hostPort) {
    return existing.hostPort;
  }

  const range = PORT_RANGES[game];
  if (!range) {
    throw new Error(`No port range configured for game: ${game}`);
  }

  // Find all ports already used by running/provisioning servers for this game.
  const usedServers = await prisma.server.findMany({
    select: { hostPort: true },
    where: {
      game,
      hostPort: { not: null },
      desiredState: { not: "deleted" },
      id: { not: serverId },
    },
  });

  const usedPorts = new Set(usedServers.map((s) => s.hostPort!));

  // Walk the range by stride to find the first free slot.
  for (
    let port = range.start;
    port + range.stride - 1 <= range.end;
    port += range.stride
  ) {
    let conflict = false;
    for (let offset = 0; offset < range.stride; offset++) {
      if (usedPorts.has(port + offset)) {
        conflict = true;
        break;
      }
    }
    if (!conflict) {
      await prisma.server.update({
        data: { hostPort: port },
        where: { id: serverId },
      });
      return port;
    }
  }

  throw new Error(
    `No free ports available for ${game} (range ${range.start}–${range.end} exhausted)`
  );
};

export const releasePort = async (serverId: string): Promise<void> => {
  await prisma.server.update({
    data: { hostPort: null },
    where: { id: serverId },
  });
};

export const getPortRange = (game: string): PortRange | undefined =>
  PORT_RANGES[game];
