"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectWoo, type ConnectState } from "@/server/actions/woo-connection";
import { WooChecks } from "./woo-checks";

type Values = { url: string; key: string; secret: string };
const EMPTY: Values = { url: "", key: "", secret: "" };

/**
 * Store address and REST keys, a live test, then save. Used in onboarding and on
 * Connections. Save unlocks only after a passing test of exactly what is typed now;
 * the server tests again before storing anything.
 */
export function WooConnectForm({ next }: { next: "onboarding" | "connections" }) {
  const t = useTranslations("connect");
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectWoo, { result: null, error: null });
  const [values, setValues] = useState<Values>(EMPTY);
  const [tested, setTested] = useState<Values | null>(null);
  const [intent, setIntent] = useState<"test" | "save">("test");

  const changed =
    tested !== null && (tested.url !== values.url || tested.key !== values.key || tested.secret !== values.secret);
  const passed = !!state.result?.ok && !changed;
  const field = (name: keyof Values) => ({
    id: `woo-${name}`,
    name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
    required: true,
    className: "h-11",
  });

  return (
    <form action={action} onSubmit={() => setTested(values)} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="woo-url">{t("url")}</Label>
        <Input
          {...field("url")}
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder={t("urlPlaceholder")}
          aria-invalid={state.error === "url" || undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="woo-key">{t("key")}</Label>
        <Input {...field("key")} autoComplete="off" spellCheck={false} placeholder="ck_…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="woo-secret">{t("secret")}</Label>
        <Input {...field("secret")} type="password" autoComplete="off" spellCheck={false} placeholder="cs_…" />
      </div>

      <details className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <summary className="min-h-8 cursor-pointer py-1 font-medium">{t("guideTitle")}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>{t("guide1")}</li>
          <li>{t("guide2")}</li>
          <li>{t("guide3")}</li>
        </ol>
      </details>

      <div aria-live="polite" className="space-y-3">
        {state.error && <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>}
        {state.result && !changed && <WooChecks checks={state.result.checks} />}
        {changed && state.result && <p className="text-sm text-muted-foreground">{t("retestHint")}</p>}
      </div>

      {passed && state.result!.categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="woo-category">{t("defaultCategory")}</Label>
          <select
            id="woo-category"
            name="defaultCategory"
            defaultValue=""
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t("createCategories")}</option>
            {state.result!.categories.map((c) => (
              <option key={c.id} value={`${c.id}:${c.name}`}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("defaultCategoryHint")}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="intent"
          value="test"
          size="lg"
          variant={passed ? "outline" : "default"}
          disabled={pending}
          onClick={() => setIntent("test")}
        >
          {pending && intent === "test" && <Loader2 className="animate-spin" />}
          {pending && intent === "test" ? t("testing") : t("test")}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="save"
          size="lg"
          disabled={!passed || pending}
          onClick={() => setIntent("save")}
        >
          {pending && intent === "save" && <Loader2 className="animate-spin" />}
          {pending && intent === "save" ? t("saving") : next === "onboarding" ? t("saveOnboarding") : t("save")}
        </Button>
      </div>
    </form>
  );
}
