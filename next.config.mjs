/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === "development";
const vercelEnvironment = process.env.VERCEL_ENV;
const isPreview = vercelEnvironment === "preview";
const isProduction = vercelEnvironment === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(!isDevelopment
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
  ...(isPreview
    ? [
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        { key: "X-Revalta-Environment", value: "preview" },
      ]
    : []),
  ...(isProduction ? [{ key: "X-Revalta-Environment", value: "production" }] : []),
];

const noStoreHeaders = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];

const nextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/dashboard/:path*", headers: noStoreHeaders },
      { source: "/api/:path*", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
