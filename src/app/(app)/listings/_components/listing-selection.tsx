"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToStore } from "@/components/app/save-to-store";
import { setListingsArchived } from "@/server/actions/archive";

/** Statuses a draft can be saved from; In store and Posted ones are updated from their own page. */
const SAVABLE = new Set(["ready", "needs_review"]);

type Row = { id: string; jobId: string; status: string };
type Selection = {
  selected: Set<string>;
  toggle: (id: string, on: boolean) => void;
  rows: Row[];
  setSelected: (ids: Set<string>) => void;
};
const Ctx = createContext<Selection | null>(null);
const useSelection = () => useContext(Ctx)!;

/**
 * Ticking listings on one page of Listings, and acting on them together. The table stays
 * a server component; only the boxes and the bar are client code. The page remounts this
 * with a new key when the filter, search, order or page changes, which clears the ticks.
 */
export function ListingSelection({
  rows,
  archived,
  children,
}: {
  rows: Row[];
  archived: boolean;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <Ctx.Provider value={{ selected, toggle, rows, setSelected }}>
      {children}
      <SelectionBar archived={archived} />
    </Ctx.Provider>
  );
}

/** One listing's box: 20 px inside a 44 px label, so the whole square is the tap target. */
export function SelectBox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <label className="relative z-10 flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        aria-label={label}
        checked={selected.has(id)}
        onChange={(e) => toggle(id, e.target.checked)}
      />
    </label>
  );
}

/** Ticks every listing on this page, or none. */
export function SelectAllBox({ withText = false }: { withText?: boolean }) {
  const t = useTranslations("listings");
  const { selected, rows, setSelected } = useSelection();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-1 text-sm md:min-h-9">
      <span className="flex size-11 items-center justify-center md:size-9">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          aria-label={withText ? undefined : t("selectAll")}
          checked={all}
          onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.id) : []))}
        />
      </span>
      {withText && t("selectAll")}
    </label>
  );
}

/** What can be done with the ticked listings; sits at the foot of the screen while any are ticked. */
function SelectionBar({ archived }: { archived: boolean }) {
  const t = useTranslations("listings");
  const tArchive = useTranslations("archive");
  const router = useRouter();
  const { selected, rows, setSelected } = useSelection();
  const [busy, setBusy] = useState(false);
  if (!selected.size) return null;
  const chosen = rows.filter((r) => selected.has(r.id));
  const savable = chosen.filter((r) => SAVABLE.has(r.status));

  const archive = async (ids: string[], to: boolean) => {
    setBusy(true);
    const r = await setListingsArchived(ids, to).catch(() => ({ ok: false, done: [] as string[] }));
    setBusy(false);
    // the ones that changed leave this view; any that didn't stay ticked to try again
    setSelected(new Set(ids.filter((id) => !r.done.includes(id))));
    router.refresh();
    if (!r.ok) return void toast.error(tArchive("failed"));
    if (to)
      toast(t("archivedCount", { count: r.done.length }), {
        action: { label: tArchive("undo"), onClick: () => void archive(r.done, false) },
      });
    else toast(t("restoredCount", { count: r.done.length }));
  };

  return (
    <div
      role="region"
      aria-label={t("selectedCount", { count: chosen.length })}
      // above the floating Snap button on phones, so it never covers the bar's buttons
      className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-lg md:bottom-4"
    >
      <p className="px-2 text-sm font-medium max-md:w-full" aria-live="polite">
        {t("selectedCount", { count: chosen.length })}
      </p>
      <div className="flex items-center gap-2 md:ml-auto">
        {archived ? (
          <Button type="button" disabled={busy} onClick={() => void archive([...selected], false)}>
            {busy ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
            {tArchive("restore")}
          </Button>
        ) : (
          <>
            {savable.length > 0 && (
              <SaveToStore
                jobId={savable[0]!.jobId}
                listingIds={savable.map((r) => r.id)}
                label={t("saveCount", { count: savable.length })}
                className="w-auto"
                onDone={() => {
                  setSelected(new Set());
                  router.refresh();
                }}
                // the saved ones show In store; the failed stay ticked for Try again
                onPartial={(failed) => setSelected(new Set(failed))}
              />
            )}
            <Button type="button" variant="outline" disabled={busy} onClick={() => void archive([...selected], true)}>
              {busy ? <Loader2 className="animate-spin" /> : <Archive />}
              {tArchive("listing")}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("clearSelection")}
          onClick={() => setSelected(new Set())}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
