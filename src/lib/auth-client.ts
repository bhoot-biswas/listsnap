import { createAuthClient } from "better-auth/react";
import { anonymousClient, inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";

/** Same origin as the app, so no base URL: /api/auth on whichever host served the page. */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    anonymousClient(),
    inferAdditionalFields({
      user: {
        uiLang: { type: "string", required: false },
        theme: { type: "string", required: false },
        phone: { type: "string", required: false },
      },
    }),
  ],
});
