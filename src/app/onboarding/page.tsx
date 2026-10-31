import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { ButtonLink } from "@/components/app/button-link";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { ShopifyConnectForm } from "@/components/app/shopify-connect-form";
import { ShopifyDemoButton } from "@/components/app/shopify-demo-button";
import { env } from "@/server/env";
import { shopifyOffered } from "@/server/stores/shopify-connect";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/auth/session";
import { OnboardingForm } from "./_components/onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("onboarding"))("title") };
}

// what /api/shopify/callback reports back with ?shopify=
const SHOPIFY_ERRORS = ["shop", "demo", "denied", "expired", "scopes", "taken", "failed"] as const;

/** S2 Onboarding: 1) name the shop, 2) connect WooCommerce or Shopify. Full-screen, no navigation. */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  if (viewer.workspace.onboarded) redirect("/dashboard");
  const query = await searchParams;
  const store = query.step === "store";
  const shopifyError = SHOPIFY_ERRORS.find((e) => e === query.shopify);
  // where Shopify can't really connect yet, onboarding offers WooCommerce alone
  const offered = shopifyOffered();
  const platform = offered && (query.store === "shopify" || shopifyError) ? "shopify" : "woo";
  const t = await getTranslations("onboarding");
  const tShopify = await getTranslations("connections.shopifyCard");
  const shopifyDemo = env().providers.shopify === "mock" || !!env().demoShopify;
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo className="size-8" />
        <LanguageSwitch />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t("step", { n: store ? 2 : 1 })}</p>
        <h1 className="text-2xl font-semibold">{store ? t("storeTitle") : t("title")}</h1>
        <p className="text-muted-foreground">{store ? t("storeBody") : t("body")}</p>
      </div>
      {store ? (
        <div className="space-y-6">
          {offered && (
            <nav aria-label={t("storeTitle")} className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              {(["woo", "shopify"] as const).map((p) => (
                <ButtonLink
                  key={p}
                  href={`/onboarding?step=store&store=${p}`}
                  variant="ghost"
                  aria-current={platform === p ? "page" : undefined}
                  className={cn("h-11", platform === p && "bg-background shadow-sm")}
                >
                  {t(p)}
                </ButtonLink>
              ))}
            </nav>
          )}
          {platform === "woo" ? (
            <WooConnectForm next="onboarding" />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{tShopify("body")}</p>
              {shopifyError && (
                <p role="alert" className="text-sm text-destructive">
                  {tShopify(`errors.${shopifyError}`)}
                </p>
              )}
              <ShopifyConnectForm next="onboarding" />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <ButtonLink href="/onboarding" variant="ghost">
              {t("back")}
            </ButtonLink>
            {platform === "woo" ? (
              <DemoStoreButton next="onboarding" />
            ) : (
              shopifyDemo && <ShopifyDemoButton next="onboarding" />
            )}
          </div>
        </div>
      ) : (
        <OnboardingForm defaultName={viewer.workspace.name === "My shop" ? "" : viewer.workspace.name} />
      )}
    </main>
  );
}
