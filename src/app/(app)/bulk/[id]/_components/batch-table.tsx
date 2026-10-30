"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { quickEditListing } from "@/server/actions/review";
import { parseAmount } from "@/lib/amount";
import { sized } from "@/lib/media-size";
import type { BatchRow } from "@/lib/batch-state";
import { cn } from "@/lib/utils";

/** Listing statuses that can go to the store from the table. */
export const SAVABLE = new Set(["ready", "needs_review"]);

type Field = "title" | "category" | "priceBdt";

/** One inline-edited cell: saves when the seller leaves it (or presses Enter), with a tick when saved. */
function InlineField({
  listingId,
  field,
  value,
  label,
  numeric,
}: {
  listingId: string;
  field: Field;
  value: string;
  label: string;
  numeric?: boolean;
}) {
  const t = useTranslations("bulk");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [last, setLast] = useState(value);
  const commit = async (raw: string) => {
    const text = raw.trim();
    if (text === last.trim()) return;
    const price = field === "priceBdt" ? parseAmount(text) : null;
    // a price with no digits in it is a slip, not a request to clear the price
    if (field === "priceBdt" && text && price === null) return;
    const patch: Record<string, unknown> = field === "priceBdt" ? { priceBdt: price } : { [field]: text };
    if (field === "title" && !text) return;
    setSaved("saving");
    const r = await quickEditListing(listingId, patch).catch(() => null);
    setSaved(r?.ok ? "saved" : "idle");
    if (r?.ok) setLast(text);
  };
  return (
    <div className="flex items-center gap-1">
      <input
        aria-label={label}
        defaultValue={value}
        inputMode={numeric ? "numeric" : undefined}
        onBlur={(e) => void commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-input focus:border-ring focus:outline-none",
          numeric && "w-24 tabular-nums",
        )}
      />
      <span className="w-4 shrink-0" aria-live="polite">
        {saved === "saving" && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {saved === "saved" && <Check className="size-3.5 text-success" aria-label={t("edited")} />}
      </span>
    </div>
  );
}

function Dots({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const n = Math.max(1, Math.round(value * 5));
  return (
    <span className="flex gap-0.5" aria-label={`${Math.round(value * 100)}%`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("size-2 rounded-full", i <= n ? (value < 0.7 ? "bg-warning" : "bg-success") : "bg-muted")}
        />
      ))}
    </span>
  );
}

/** The row's status: the listing's word once there is one, otherwise what the job is doing. */
function RowStatus({ row, active }: { row: BatchRow; active: boolean }) {
  const t = useTranslations("bulk");
  if (row.jobStatus === "awaiting_choice")
    return (
      <Link href={`/job/${row.jobId}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {t("needsChoice")}
      </Link>
    );
  if (row.stuck || (row.jobStatus === "failed" && !row.listing))
    return (
      <Link
        href={`/job/${row.jobId}`}
        className="text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        {t("stuck")}
      </Link>
    );
  if (row.listing && row.listing.status !== "processing") return <StatusBadge status={row.listing.status} />;
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {active && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {active ? t("working") : t("waiting")}
    </span>
  );
}

/**
 * The batch's rows. Desktop gets a table with inline title, price and category, so
 * twenty listings can be checked without opening each; phone gets one card per photo.
 */
export function BatchTable({
  rows,
  activeJobIds,
  selected,
  onSelect,
  onSelectAll,
}: {
  rows: BatchRow[];
  /** Jobs the runner is working on right now; the rest are waiting their turn. */
  activeJobIds: Set<string>;
  selected: Set<string>;
  onSelect: (listingId: string, on: boolean) => void;
  onSelectAll: (listingIds: string[]) => void;
}) {
  const t = useTranslations("bulk");
  const format = useFormatter();
  const savable = rows.flatMap((r) => (r.listing && SAVABLE.has(r.listing.status) ? [r.listing.id] : []));
  const allOn = savable.length > 0 && savable.every((id) => selected.has(id));

  const thumb = (r: BatchRow) => (
    // eslint-disable-next-line @next/next/no-img-element -- small private /media thumbnails
    <img
      src={sized(r.thumbUrl ?? r.photoUrl ?? "", 96)}
      alt=""
      className="size-12 rounded-md border bg-white object-cover"
    />
  );
  const checkbox = (r: BatchRow) =>
    r.listing && SAVABLE.has(r.listing.status) ? (
      // a 20 px box inside a 44 px label, so the whole square is the tap target
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={selected.has(r.listing.id)}
          onChange={(e) => onSelect(r.listing!.id, e.target.checked)}
          aria-label={t("select", { title: r.listing.title ?? "" })}
        />
      </label>
    ) : null;
  const reviewLink = (r: BatchRow) =>
    r.listing && r.listing.title ? (
      <Link
        href={`/job/${r.jobId}/review?l=${r.listing.id}`}
        className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("review")}
      </Link>
    ) : (
      <Link href={`/job/${r.jobId}`} className="inline-flex min-h-10 items-center text-sm text-muted-foreground">
        {t("open")}
      </Link>
    );

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card max-md:hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={allOn}
                  disabled={!savable.length}
                  onChange={(e) => onSelectAll(e.target.checked ? savable : [])}
                  aria-label={t("selectAll")}
                />
              </th>
              <th className="p-3 font-medium">{t("colPhoto")}</th>
              <th className="p-3 font-medium">{t("colTitle")}</th>
              <th className="p-3 font-medium">{t("colPrice")}</th>
              <th className="p-3 font-medium">{t("colCategory")}</th>
              <th className="p-3 font-medium max-lg:hidden">{t("colConfidence")}</th>
              <th className="p-3 font-medium">{t("colStatus")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.jobId}>
                <td className="p-3">{checkbox(r)}</td>
                <td className="p-3">{thumb(r)}</td>
                <td className="min-w-44 p-1">
                  {r.listing?.title ? (
                    <InlineField listingId={r.listing.id} field="title" value={r.listing.title} label={t("colTitle")} />
                  ) : (
                    <span className="px-2 text-muted-foreground">—</span>
                  )}
                  {r.listingCount > 1 && (
                    <span className="px-2 text-xs text-muted-foreground">
                      {t("moreListings", { count: r.listingCount - 1 })}
                    </span>
                  )}
                </td>
                <td className="p-1">
                  {r.listing?.title ? (
                    <InlineField
                      listingId={r.listing.id}
                      field="priceBdt"
                      value={r.listing.priceBdt === null ? "" : String(r.listing.priceBdt)}
                      label={t("colPrice")}
                      numeric
                    />
                  ) : (
                    <span className="px-2 text-muted-foreground">—</span>
                  )}
                </td>
                <td className="min-w-28 p-1">
                  {r.listing?.title ? (
                    <InlineField
                      listingId={r.listing.id}
                      field="category"
                      value={r.listing.category ?? ""}
                      label={t("colCategory")}
                    />
                  ) : (
                    <span className="px-2 text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 max-lg:hidden">
                  <Dots value={r.listing?.confidence ?? null} />
                </td>
                <td className="p-3">
                  <RowStatus row={r} active={activeJobIds.has(r.jobId)} />
                </td>
                <td className="p-3 text-right">{reviewLink(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.jobId} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            {checkbox(r)}
            {thumb(r)}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">{r.listing?.title ?? "…"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <RowStatus row={r} active={activeJobIds.has(r.jobId)} />
                {r.listing?.priceBdt != null && (
                  <span className="text-sm tabular-nums">৳{format.number(r.listing.priceBdt)}</span>
                )}
              </div>
            </div>
            {reviewLink(r)}
          </li>
        ))}
      </ul>
    </>
  );
}
