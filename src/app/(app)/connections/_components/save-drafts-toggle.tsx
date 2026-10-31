import { getTranslations } from "next-intl/server";
import { PendingButton } from "@/components/app/form-buttons";
import { setSaveDrafts } from "@/server/actions/store-settings";
import type { StoreKind } from "@/lib/stores";

/** For a shop with two stores: whether new drafts go to this one, and the switch. */
export async function SaveDraftsToggle({ kind, on }: { kind: StoreKind; on: boolean }) {
  const t = await getTranslations("connections");
  return (
    <form
      action={setSaveDrafts}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <p className="text-sm">{on ? t("savingHere") : t("notSavingHere")}</p>
      <PendingButton variant="outline" className="h-11 md:h-9">
        {on ? t("stopSaving") : t("startSaving")}
      </PendingButton>
    </form>
  );
}
