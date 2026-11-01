"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ListingSort } from "@/server/db/overview";

/**
 * The Listings order, kept in the URL like the filters. The server builds each order's
 * address, so this only follows one; a change starts again from the first page.
 */
export function ListingSortSelect({
  value,
  hrefs,
  labels,
  label,
}: {
  value: ListingSort;
  hrefs: Record<string, Route>;
  labels: Record<string, string>;
  label: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => router.push(hrefs[e.target.value]!)}
      className="h-11 max-w-44 shrink-0 rounded-lg border border-input bg-card px-2 text-sm md:h-9"
    >
      {Object.entries(labels).map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </select>
  );
}
