"use client";

import { ErrorState } from "@/components/app/error-state";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
