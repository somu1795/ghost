import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// In self-hosted mode the agent binary is pre-compiled at Docker image build
// time (see Dockerfile). This function simply reads the static binary from
// disk and returns its SHA-256 digest — matching the interface the snapshot
// workflow expects.
const AGENT_PATH =
  process.env.GHOST_AGENT_PATH ?? path.resolve("dist/ghost-agent");

const sha256 = (buf: Buffer): string =>
  crypto.createHash("sha256").update(buf).digest("hex");

export const compileAgentBinary = async (): Promise<{
  bytes: Buffer;
  sha: string;
}> => {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await fs.readFile(AGENT_PATH));
  } catch (error) {
    throw new Error(
      `Agent binary not found at ${AGENT_PATH}. Ensure the binary was built during the Docker image build.`,
      { cause: error }
    );
  }

  if (bytes.length < 1_000_000) {
    throw new Error(
      `Agent binary suspiciously small (${bytes.length} bytes); expected ~100 MB`
    );
  }
  if (bytes[0] !== 0x7f || bytes[1] !== 0x45) {
    throw new Error(
      `Agent binary is not an ELF (first bytes: ${[...bytes.subarray(0, 4)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")})`
    );
  }

  return { bytes, sha: sha256(bytes) };
};
