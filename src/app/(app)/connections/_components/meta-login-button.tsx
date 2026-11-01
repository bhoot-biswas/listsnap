import { PendingButton } from "@/components/app/form-buttons";

/**
 * Off to Facebook to choose Pages. A plain GET to the install route, not a server action:
 * the browser itself must follow the redirects to Facebook and back, so the one-time
 * state cookie is spent by that one visit.
 */
export function MetaLoginButton({ label, variant }: { label: string; variant?: "outline" }) {
  return (
    <form method="get" action="/api/meta/install">
      <PendingButton size="lg" variant={variant}>
        {label}
      </PendingButton>
    </form>
  );
}
