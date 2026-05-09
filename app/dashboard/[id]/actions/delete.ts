"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { teardownQueue } from "@/lib/queue";
import { requireUser } from "@/lib/session";

const inputSchema = z.object({ serverId: z.string().min(1) });

export type DeleteServerInput = z.infer<typeof inputSchema>;

export type DeleteServerResult = { ok: true } | { error: string; ok: false };

export const deleteServer = async (
  input: DeleteServerInput
): Promise<DeleteServerResult> => {
  const user = await requireUser();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", ok: false };
  }

  const server = await prisma.server.findFirst({
    where: { deletedAt: null, id: parsed.data.serverId, userId: user.id },
  });
  if (!server) {
    return { error: "Not found", ok: false };
  }

  await prisma.server.update({
    data: { desiredState: "deleted" },
    where: { id: parsed.data.serverId },
  });

  await teardownQueue.add("teardown-server", { serverId: parsed.data.serverId });

  revalidatePath("/dashboard", "layout");

  return { ok: true };
};
