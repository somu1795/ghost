import "server-only";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL must be set");
}

export const redis = new Redis(REDIS_URL);
