/** The ListSnap mark: a camera frame with a tag corner. Decorative; the name is always next to it. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        d="M9 12.5A2.5 2.5 0 0 1 11.5 10h2l1.2-1.6h2.6L18.5 10h2a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 9 19.5z"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3" fill="var(--marigold)" />
    </svg>
  );
}
