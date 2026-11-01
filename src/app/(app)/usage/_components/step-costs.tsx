import { getFormatter, getTranslations } from "next-intl/server";
import type { UsageStep } from "@/server/db/scope";

const KNOWN = new Set([
  "listen",
  "plan",
  "segment",
  "group",
  "write",
  "translate",
  "render",
  "assist",
  "store",
  "connect",
  "look",
  "reel",
  "post",
  "chat",
]);

/**
 * Where the money goes, step by step, straight from the API log: the model behind each
 * step, its calls, how long a live call takes and its share of the month's cost.
 */
export async function StepCosts({ steps, money }: { steps: UsageStep[]; money: (n: number) => string }) {
  const t = await getTranslations("usage.steps");
  const format = await getFormatter();
  const total = steps.reduce((a, s) => a + Number(s.cost), 0);
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="steps" className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
      <div>
        <h2 id="steps" className="text-base font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <ul className="divide-y">
        {steps.map((s) => {
          const cost = Number(s.cost);
          const share = total > 0 ? cost / total : 0;
          const mock = Number(s.mock);
          const failed = Number(s.failed);
          return (
            <li key={`${s.provider}-${s.step}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{KNOWN.has(s.step) ? t(`name.${s.step}`) : s.step}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{s.model}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">{money(cost)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {format.number(share, { style: "percent" })}
                </p>
              </div>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                {[
                  t("calls", { count: Number(s.calls) }),
                  mock ? t("mock", { count: mock }) : null,
                  s.avg_ms != null
                    ? t("avg", { s: format.number(s.avg_ms / 1000, { maximumFractionDigits: 1 }) })
                    : null,
                  failed ? t("failed", { count: failed }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
