import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z
      .string()
      .min(1)
      .startsWith("G-")
      .optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1).url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).startsWith("phc_").optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).url().optional(),
  },
  runtimeEnv: {
    ANALYZE: process.env.ANALYZE,
    APP_URL: process.env.APP_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BOOTSTRAP_JWT_SECRET: process.env.BOOTSTRAP_JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    REDIS_URL: process.env.REDIS_URL,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    STORAGE_DIR: process.env.STORAGE_DIR,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  },
  server: {
    ANALYZE: z.string().optional(),
    APP_URL: z.string().min(1).url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    BETTER_AUTH_URL: z.string().min(1).url(),
    BOOTSTRAP_JWT_SECRET: z.string().min(32),

    DATABASE_URL: z.string().min(1).url(),
    DATABASE_URL_UNPOOLED: z.string().min(1).url().optional(),

    NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),
    REDIS_URL: z.string().min(1),

    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ENDPOINT: z.string().min(1).url().optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),

    SENTRY_ORG: z.string().min(1).optional(),
    SENTRY_PROJECT: z.string().min(1).optional(),

    STORAGE_DIR: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
  },
});

// In self-hosted mode, APP_URL replaces all Vercel URL derivation.
export const SEO_URL = env.APP_URL;
export const API_URL = env.APP_URL;
export const SNAPSHOT_ENVIRONMENT = "production";
