"use server";

import crypto from "node:crypto";

import type { Prisma } from "@prisma/client";
import { humanId } from "human-id";
import { revalidatePath } from "next/cache";
import { ulid } from "ulid";
import { z } from "zod";

import { games, validateSettings } from "@/games";
import { prisma } from "@/lib/db";
import { provisionQueue } from "@/lib/queue";
import { requireUser } from "@/lib/session";

const createServerSchema = z.object({
  game: z.enum(games.map((g) => g.id) as [string, ...string[]]),
  name: z.string().min(3).max(40),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;

export type CreateServerResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export const createServer = async (
  input: CreateServerInput
): Promise<CreateServerResult> => {
  const user = await requireUser();

  const parsed = createServerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", ok: false };
  }

  const game = games.find((g) => g.id === parsed.data.game);
  if (!game) {
    return { error: "Unknown game", ok: false };
  }

  let settings: Record<string, unknown> = {};
  if (parsed.data.settings) {
    const validation = validateSettings(game.settings, parsed.data.settings);
    if (!validation.ok) {
      return { error: validation.error, ok: false };
    }
    settings = validation.data as Record<string, unknown>;
  }

  const id = ulid();
  const rconPassword = crypto.randomBytes(16).toString("hex");
  const joinPassword = game.usesJoinPassword
    ? humanId({ adjectiveCount: 0, capitalize: false, separator: "-" })
    : null;

  const server = await prisma.server.create({
    data: {
      desiredState: "running",
      game: parsed.data.game,
      id,
      joinPassword,
      location: "local",
      name: parsed.data.name,
      observedState: "pending",
      phase: "queued",
      rconPassword,
      serverType: "docker",
      settings: settings as Prisma.InputJsonValue,
      userId: user.id,
    },
  });

  await provisionQueue.add("provision-server", { serverId: server.id });

  revalidatePath("/dashboard", "layout");

  return { id: server.id, ok: true };
};
