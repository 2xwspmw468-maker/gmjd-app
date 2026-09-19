import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/gmjd-app",
  assetPrefix: "/gmjd-app/",
  trailingSlash: true,
};

export default nextConfig;
