"use client";

import { ErrorState } from "@/components/app/error-state";

// public pages are mostly seen signed out, where the dashboard would only bounce to sign-in
export default function PublicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState error={error} retry={retry} back={{ href: "/", label: "goHome" }} />;
}
