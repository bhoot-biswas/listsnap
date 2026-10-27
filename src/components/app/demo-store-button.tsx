import { getTranslations } from "next-intl/server";
import { connectDemoStore } from "@/server/actions/woo-connection";

/** "No store yet? Use the demo store for now." A form of its own, so it never sends typed keys. */
export async function DemoStoreButton({ next }: { next: "onboarding" | "connections" }) {
  const t = await getTranslations("connect");
  return (
    <form action={connectDemoStore}>
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline">
        {t("demoStore")}
      </button>
    </form>
  );
}
