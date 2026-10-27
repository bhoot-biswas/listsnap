import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Upload bodies go straight to Route Handlers; the proxy never matches /api, so its
  // 10 MB body buffer does not apply. Images are served by our own /media route.
  poweredByHeader: false,
};

// No locale routing: the UI language comes from the profile or a cookie (src/i18n/request.ts).
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
