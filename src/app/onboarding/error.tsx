"use client";

import { ErrorState } from "@/components/app/error-state";

// the dashboard sends an unfinished shop straight back here, so Try again is the only way on
export default function OnboardingError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState error={error} retry={retry} back={null} />;
}
