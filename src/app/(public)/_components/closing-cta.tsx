import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { DemoButton } from "./demo-button";

const SAMPLES = ["saree", "bangles", "kurti"] as const;

/** Section 4: one last, single way in. */
export async function ClosingCta({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("landing");
  return (
    <section aria-labelledby="closing-title" className="mx-auto max-w-5xl px-4 py-20 md:px-6 md:py-28">
      <div className="rounded-3xl bg-primary-soft px-6 py-14 text-center md:py-20">
        <div className="flex justify-center -space-x-3" aria-hidden="true">
          {SAMPLES.map((key) => (
            <div
              key={key}
              className="relative size-14 overflow-hidden rounded-full border-4 border-primary-soft bg-white"
            >
              <Image src={`/samples/${key}-studio.jpg`} alt="" fill sizes="56px" className="object-cover" />
            </div>
          ))}
        </div>
        <h2 id="closing-title" className="mt-6 text-3xl font-bold text-balance md:text-4xl">
          {t("closing.title")}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {t("closing.body")}{" "}
          <Link href="/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("closing.pricing")}
          </Link>
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="lg" className="rounded-full px-6">
              {t("openShop")}
              <ArrowRight aria-hidden="true" />
            </ButtonLink>
          ) : (
            <>
              <DemoButton />
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
              >
                {t("signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
