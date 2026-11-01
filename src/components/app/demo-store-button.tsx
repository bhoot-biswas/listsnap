import { getTranslations } from "next-intl/server";
import { PendingButton } from "@/components/app/form-buttons";
import { connectDemoStore } from "@/server/actions/woo-connection";

/** "No store yet? Use the demo store for now." A form of its own, so it never sends typed keys. */
export async function DemoStoreButton({
  next,
  label,
  variant = "link",
}: {
  next: "onboarding" | "connections";
  /** Where several demo stores are offered side by side, each says which it is. */
  label?: string;
  /** A plain link beside other choices; a full button where it is the way on, as in onboarding. */
  variant?: "link" | "outline";
}) {
  const t = await getTranslations("connect");
  return (
    <form action={connectDemoStore}>
      <input type="hidden" name="next" value={next} />
      <PendingButton variant={variant} className={variant === "link" ? "h-auto min-h-11 px-0" : "h-11 w-full"}>
        {label ?? t("demoStore")}
      </PendingButton>
    </form>
  );
}
