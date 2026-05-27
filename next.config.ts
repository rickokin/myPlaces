import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

const isDev = process.env.NODE_ENV === "development";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://maps.gstatic.com https://*.clerk.accounts.dev https://clerk.com https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.google.com https://*.googleapis.com https://*.gstatic.com https://img.clerk.com;
  connect-src 'self' https://maps.googleapis.com https://places.googleapis.com https://*.clerk.accounts.dev https://clerk.com https://challenges.cloudflare.com;
  frame-src 'self' https://clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`
  .replace(/\n\s*/g, " ")
  .trim();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  turbopack: {
    root: __dirname,
  },
  // Allow LAN devices (phones for PWA install / push testing) to talk to
  // the dev server's HMR + asset endpoints. Add additional hosts here as
  // needed.
  allowedDevOrigins: ["192.168.0.60"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          { key: "Content-Security-Policy", value: cspHeader },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
