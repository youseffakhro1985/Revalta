/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === "development";

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
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(!isDevelopment
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const noStoreHeaders = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
const noIndexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

const nextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/dashboard/:path*", headers: [...noStoreHeaders, ...noIndexHeaders] },
      { source: "/api/:path*", headers: [...noStoreHeaders, ...noIndexHeaders] },
      { source: "/portal/:path*", headers: noIndexHeaders },
      { source: "/login", headers: noIndexHeaders },
      { source: "/register", headers: noIndexHeaders },
      { source: "/forgot-password", headers: noIndexHeaders },
      { source: "/reset-password", headers: noIndexHeaders },
      { source: "/accept-invite", headers: noIndexHeaders },
      { source: "/verify-email", headers: noIndexHeaders },
      { source: "/arbetsrapport/:path*", headers: noIndexHeaders },
      { source: "/underhallsrapport/:path*", headers: noIndexHeaders },
    ];
  },
};

export default nextConfig;
