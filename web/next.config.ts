import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Dev resources are same-origin by default, so opening the app on 127.0.0.1 (rather than
  // localhost) gets the hot-reload channel blocked and the client never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
