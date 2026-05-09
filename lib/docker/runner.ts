/**
 * lib/docker/runner.ts
 *
 * High-level Docker operations used by the provision/teardown workflows.
 * Each function is idempotent and logs activity events to the DB.
 */
import type Dockerode from "dockerode";

import { getGame } from "@/games";
import { prisma } from "@/lib/db";
import { emitActivity, emitLog } from "@/lib/events/emit";

import { getDockerClient } from "./index";
import { allocatePort, releasePort } from "./ports";

const CONTAINER_LABEL = "ghost.managed";
const PULL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

const containerName = (serverId: string) =>
  `ghost-game-${serverId.toLowerCase().slice(-12)}`;

const getContainer = (
  docker: Dockerode,
  serverId: string
): Dockerode.Container =>
  docker.getContainer(containerName(serverId));

const pullImage = async (
  docker: Dockerode,
  image: string,
  serverId: string
): Promise<void> => {
  await emitLog({
    line: `Pulling image ${image}…`,
    serverId,
    stream: "stdout",
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Image pull timed out")),
      PULL_TIMEOUT_MS
    );

    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) {
        clearTimeout(timer);
        return reject(err);
      }
      docker.modem.followProgress(
        stream,
        (followErr: Error | null) => {
          clearTimeout(timer);
          if (followErr) reject(followErr);
          else resolve();
        },
        (event: { status?: string; progress?: string }) => {
          if (event.status) {
            emitLog({
              line: event.progress
                ? `${event.status} ${event.progress}`
                : event.status,
              serverId,
              stream: "stdout",
            }).catch(() => {});
          }
        }
      );
    });
  });
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Pull the game image and start the container.
 * Returns the allocated host port.
 */
export const startGameContainer = async (
  serverId: string
): Promise<{ hostPort: number; containerId: string }> => {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
  });
  const game = getGame(server.game);
  if (!game) throw new Error(`Unknown game: ${server.game}`);

  const docker = getDockerClient();
  const name = containerName(serverId);

  // Allocate a host port for this server.
  const hostPort = await allocatePort(serverId, server.game);

  // Build the docker-compose-style env / config → we re-use the existing
  // buildCompose() to get the environment variables the image expects, then
  // parse them out.  For simplicity we run the container directly via dockerode
  // rather than spawning docker-compose.
  const gameConfig = game.buildCompose(
    {
      joinPassword: server.joinPassword,
      name: server.name,
      rconPassword: server.rconPassword,
    },
    server.settings
  );

  // Parse env vars from the compose YAML snippet (simple regex – the compose
  // strings are always key: "value" format).
  const envVars: string[] = [];
  const envRegex = /^\s{6}(\w+):\s+"(.*)"\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = envRegex.exec(gameConfig)) !== null) {
    envVars.push(`${match[1]}=${match[2]}`);
  }

  // Pull the image first.
  await emitActivity({
    message: "Pulling game image",
    phase: "installing",
    serverId,
  });
  await prisma.server.update({
    data: { phase: "installing", observedState: "provisioning" },
    where: { id: serverId },
  });

  await pullImage(docker, game.dockerImage, serverId);

  // Build port bindings: map game's declared ports → hostPort + offset.
  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, Array<{ HostPort: string }>> = {};

  game.ports.forEach((p, idx) => {
    const proto = p.protocol;
    const containerPort = p.from;
    const actualHostPort = hostPort + idx;
    const key = `${containerPort}/${proto}`;
    exposedPorts[key] = {};
    portBindings[key] = [{ HostPort: String(actualHostPort) }];

    // If port is a range (from ≠ to), map each port in the range.
    if (p.from !== p.to) {
      for (let cp = p.from + 1; cp <= p.to; cp++) {
        const rangeKey = `${cp}/${proto}`;
        exposedPorts[rangeKey] = {};
        portBindings[rangeKey] = [{ HostPort: String(actualHostPort + (cp - p.from)) }];
      }
    }
  });

  // Volume: store game data in a named Docker volume scoped to the server.
  const volumeName = `ghost-game-data-${serverId.toLowerCase().slice(-12)}`;

  await emitActivity({
    message: `Starting container on port ${hostPort}`,
    metadata: { hostPort },
    phase: "installing",
    serverId,
  });

  const container = await docker.createContainer({
    Env: envVars,
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      RestartPolicy: { Name: "unless-stopped" },
      Binds: [`${volumeName}:/data`],
    },
    Image: game.dockerImage,
    Labels: {
      [CONTAINER_LABEL]: "true",
      "ghost.serverId": serverId,
      "ghost.game": server.game,
    },
    name,
  });

  await container.start();

  // Stream container logs into the Ghost log system asynchronously.
  streamContainerLogs(container, serverId).catch(() => {});

  return { containerId: container.id, hostPort };
};

/**
 * Stop and remove the container for a server.
 */
export const stopGameContainer = async (serverId: string): Promise<void> => {
  const docker = getDockerClient();
  const container = getContainer(docker, serverId);

  try {
    await container.stop({ t: 10 });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== 304 && statusCode !== 404) throw err; // 304 = already stopped
  }

  try {
    await container.remove({ v: false });
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
};

/**
 * Returns "running", "stopped", or "missing".
 */
export const getContainerStatus = async (
  serverId: string
): Promise<"running" | "stopped" | "missing"> => {
  const docker = getDockerClient();
  try {
    const info = await getContainer(docker, serverId).inspect();
    return info.State.Running ? "running" : "stopped";
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode === 404) return "missing";
    throw err;
  }
};

/**
 * Tail container logs and write them to the Ghost LogChunk table.
 * Runs until the container stops.
 */
export const streamContainerLogs = async (
  container: Dockerode.Container,
  serverId: string
): Promise<void> => {
  try {
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: false,
    });

    // dockerode returns a multiplexed stream; demux it.
    container.modem.demuxStream(
      logStream as unknown as NodeJS.ReadableStream,
      {
        write: (chunk: Buffer) => {
          const line = chunk.toString("utf8").trimEnd();
          if (line) {
            emitLog({ line, serverId, stream: "stdout" }).catch(() => {});
          }
        },
      } as unknown as NodeJS.WritableStream,
      {
        write: (chunk: Buffer) => {
          const line = chunk.toString("utf8").trimEnd();
          if (line) {
            emitLog({ line, serverId, stream: "stderr" }).catch(() => {});
          }
        },
      } as unknown as NodeJS.WritableStream
    );

    await new Promise<void>((resolve) => {
      (logStream as unknown as NodeJS.ReadableStream).on("end", resolve);
      (logStream as unknown as NodeJS.ReadableStream).on("error", resolve);
    });
  } catch {
    // Container gone; silently stop.
  }
};

/**
 * Re-attach log streaming for a server whose container is already running
 * (called when Ghost restarts and containers are still up).
 */
export const reattachLogs = async (serverId: string): Promise<void> => {
  const docker = getDockerClient();
  const container = getContainer(docker, serverId);
  streamContainerLogs(container, serverId).catch(() => {});
};

/**
 * Cleanup: stop + remove + release port.
 */
export const destroyGameServer = async (serverId: string): Promise<void> => {
  await stopGameContainer(serverId);
  await releasePort(serverId);
};
