import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages at https://mtechx1.github.io/Re-Office/
 * `next build` writes `out/`. The Pages workflow uploads that folder.
 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Re-Office",
  assetPrefix: "/Re-Office",
  poweredByHeader: false,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
