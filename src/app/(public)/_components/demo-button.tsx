"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** "Try the demo shop" straight from the homepage: the same anonymous sign-in the sign-in page offers. */
export function DemoButton({ className }: { className?: string }) {
  const t = useTranslations("landing");
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const r = await authClient.signIn.anonymous();
      // 400 means already in a demo shop, so go back to it. Any other failure lands on
      // the sign-in page, which says so and offers the other ways in.
      router.push(r.error && r.error.status !== 400 ? "/sign-in?error=demo" : "/dashboard");
      router.refresh();
    });

  return (
    <Button size="lg" onClick={go} disabled={pending} className={cn("rounded-full px-6", className)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      <span aria-live="polite">{pending ? t("startingDemo") : t("tryDemo")}</span>
      {pending ? null : <ArrowRight aria-hidden="true" />}
    </Button>
  );
}
