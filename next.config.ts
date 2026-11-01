import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Upload bodies go straight to Route Handlers; the proxy never matches /api, so its
  // 10 MB body buffer does not apply. Images are served by our own /media route.
  poweredByHeader: false,
  // The app holds store keys and buttons that change a seller's store, so no other site
  // may frame it (the Shopify app isn't embedded), and only this site may use the camera
  // and microphone (snaps, voice notes, chat dictation).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // browsers ignore it over plain http, so local development is unaffected
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

// No locale routing: the UI language comes from the profile or a cookie (src/i18n/request.ts).
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
