import type { NextConfig } from "next";

function originHost(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function cspUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

const appHost = originHost(process.env.NEXT_PUBLIC_APP_URL);
const configuredAllowedOrigins = (process.env.APP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const serverActionOrigins = [
  appHost,
  ...configuredAllowedOrigins,
  ...(process.env.NODE_ENV === "production" ? [] : ["localhost:3000"]),
].filter(Boolean) as string[];

const socketConnectUrl = cspUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
const devConnectSources =
  process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3001", "ws://localhost:3001"];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { allowedOrigins: serverActionOrigins },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "maps.googleapis.com" }],
  },
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com",
          "font-src 'self' data:",
          [
            "connect-src 'self' https: wss: https://maps.googleapis.com",
            socketConnectUrl,
            ...devConnectSources,
          ]
            .filter(Boolean)
            .join(" "),
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
      },
    ];

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
