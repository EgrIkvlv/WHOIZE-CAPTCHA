import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@whoize/captcha-core", "@whoize/captcha-react"],
};

export default nextConfig;
