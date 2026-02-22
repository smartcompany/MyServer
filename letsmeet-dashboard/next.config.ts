import type { NextConfig } from "next";

const BASE_PATH = "/letsmeet-dashboard";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.txt": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    // Allow importing plain text files (e.g., prompts) as raw strings
    config.module.rules.push({
      test: /\.txt$/i,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
