import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

import { env } from "@/lib/env";

const otelRegex = /@opentelemetry\/instrumentation/u;

let config: NextConfig = {
  output: "standalone",

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        hostname: "shared.fastly.steamstatic.com",
        pathname: "/store_item_assets/steam/apps/**",
        protocol: "https",
      },
    ],
  },

  rewrites() {
    return Promise.resolve([
      {
        destination: "https://us-assets.i.posthog.com/static/:path*",
        source: "/ingest/static/:path*",
      },
      {
        destination: "https://us.i.posthog.com/:path*",
        source: "/ingest/:path*",
      },
      {
        destination: "https://us.i.posthog.com/decide",
        source: "/ingest/decide",
      },
    ]);
  },

  webpack(cfg) {
    cfg.ignoreWarnings = [{ module: otelRegex }];
    return cfg;
  },
};

// Sentry is optional — only enable when DSN is configured
if (env.NEXT_PUBLIC_SENTRY_DSN && env.SENTRY_ORG && env.SENTRY_PROJECT) {
  config = withSentryConfig(
    { ...config, transpilePackages: ["@sentry/nextjs"] },
    {
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      silent: true,
      tunnelRoute: "/monitoring",
      widenClientFileUpload: true,
    }
  );
}

if (env.ANALYZE === "true") {
  config = withBundleAnalyzer()(config);
}

export default config;
