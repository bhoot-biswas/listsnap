"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, LayoutGrid, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CatalogState {
  /** Facebook is connected with catalog access, and a catalog is chosen; its name. */
  catalogName: string | null;
  /** Why it can't be used yet, in the order the seller fixes it. */
  blocked: "connect" | "choose" | "website" | null;
  saved: { items: number; checked: boolean } | null;
}

type Sending = { kind: "idle" } | { kind: "sending" } | { kind: "failed"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The listing in the shop's Facebook catalog, for catalog ads and product tags. Saving
 * runs on the server under the step rules; the seller's last edits are saved first.
 */
export function CatalogPanel({
  listingId,
  catalog,
  beforeSave,
}: {
  listingId: string;
  catalog: CatalogState;
  beforeSave: () => Promise<unknown>;
}) {
  const t = useTranslations("review.catalog");
  const router = useRouter();
  const [state, setState] = useState<Sending>({ kind: "idle" });

  async function save() {
    setState({ kind: "sending" });
    await beforeSave().catch(() => undefined);
    const update = !!catalog.saved;
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`/api/listings/${listingId}/catalog${update && i === 0 ? "?update=1" : ""}`, {
        method: "POST",
      }).catch(() => null);
      if (res?.status === 202) {
        await sleep(2000);
        continue;
      }
      const body = (await res?.json().catch(() => null)) as { state?: string; error?: string } | null;
      if (res?.ok && body?.state === "done") {
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      setState({ kind: "failed", message: body?.error ?? t("failed") });
      return;
    }
    setState({ kind: "failed", message: t("failed") });
  }

  const busy = state.kind === "sending";
  return (
    <section aria-labelledby="catalog-title" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 id="catalog-title" className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("intro")}</p>
      </div>

      {catalog.blocked ? (
        <p className="text-sm">
          {t(`blocked.${catalog.blocked}`)}{" "}
          <Link
            href={catalog.blocked === "website" ? "/settings#shop" : "/connections/meta"}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
          >
            {catalog.blocked === "website" ? t("openSettings") : t("openConnections")}
          </Link>
        </p>
      ) : (
        <>
          {catalog.saved && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <Check className="size-4 text-success" aria-hidden="true" />
              <span className="font-medium text-success">{t("saved", { catalog: catalog.catalogName ?? "" })}</span>
              <span className="text-muted-foreground">
                {catalog.saved.checked ? t("items", { count: catalog.saved.items }) : t("checking")}
              </span>
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {catalog.saved ? t("update") : t("save", { catalog: catalog.catalogName ?? "" })}
          </Button>
          <p role="status" aria-live="polite" className="text-sm">
            {busy && <span className="text-muted-foreground">{t("sending")}</span>}
            {state.kind === "failed" && <span className="text-destructive">{state.message}</span>}
          </p>
        </>
      )}
    </section>
  );
}
