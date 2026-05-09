import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

// In self-hosted mode, file uploads go directly to this API route as
// multipart/form-data instead of using Vercel Blob's client-side upload flow.
export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await requireUser();
  const { id } = await context.params;

  const server = await prisma.server.findFirst({
    where: { deletedAt: null, id, userId: user.id },
  });

  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File must be under 500 MB" },
        { status: 400 }
      );
    }

    // Store the file in a temp location and return a URL the client can use
    // to install it on the game server via the install-from-URL flow.
    const { storagePut } = await import("@/lib/storage");
    const pathname = `uploads/${id}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await storagePut(pathname, buffer, {
      addRandomSuffix: true,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
};
