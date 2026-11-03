import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Camera, Check, ImageIcon, KeyRound, Loader2, Lock, Upload } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { DEMO_SAMPLES } from "@/server/demo/samples";
import { cn } from "@/lib/utils";

const saree = DEMO_SAMPLES.find((s) => s.key === "saree")!;
const mock = "rounded-2xl border bg-card p-4 shadow-sm";

/**
 * Small pictures of the real screens, drawn from the app's own words and badges. They
 * repeat what the step text says, so screen readers skip them.
 */
async function Mocks() {
  const tSnap = await getTranslations("snap");
  const tJob = await getTranslations("job.steps");
  const t = await getTranslations("landing.how");
  return {
    snap: (
      <div className={cn(mock, "border-dashed text-center")}>
        <Camera className="mx-auto size-6 text-muted-foreground" />
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-primary-foreground">
            <Camera className="size-4" />
            {tSnap("take")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5">
            <Upload className="size-4" />
            {tSnap("upload")}
          </span>
        </div>
      </div>
    ),
    work: (
      <ul className={cn(mock, "space-y-2.5 text-sm")}>
        {(["plan", "segment"] as const).map((step) => (
          <li key={step} className="flex items-center gap-2">
            <Check className="size-4 text-success" />
            {tJob(step)}
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 font-medium">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            {tJob("write")}
          </span>
          <StatusBadge status="processing" />
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <span className="grid size-4 place-items-center">
            <span className="size-1.5 rounded-full bg-current" />
          </span>
          {tJob("translate")}
        </li>
      </ul>
    ),
    polish: (
      <div className={cn(mock, "space-y-2 text-sm")}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{t("mockTitle")}</span>
          <span className="flex rounded-lg border p-0.5 text-xs">
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-primary">EN</span>
            <span lang="bn" className="px-2 py-0.5 text-muted-foreground">
              বাং
            </span>
          </span>
        </div>
        <p lang="en" className="truncate rounded-lg border bg-background px-3 py-2">
          {saree.en.title}
        </p>
        <StatusBadge status="needs_review" />
      </div>
    ),
    save: (
      <div className={cn(mock, "flex items-center gap-3")}>
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-white">
          <Image src="/samples/saree-studio.jpg" alt="" fill sizes="56px" className="object-cover" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Check className="size-4 text-success" />
            {t("mockSaved")}
          </p>
          <StatusBadge status="in_store" />
        </div>
      </div>
    ),
  };
}

const STEPS = ["snap", "work", "polish", "save"] as const;
const TRUST = [
  { key: "draft", icon: Lock },
  { key: "keys", icon: KeyRound },
  { key: "photos", icon: ImageIcon },
] as const;

/** Section 3: four numbered steps on one line, then why it is safe to try. */
export async function HowItWorks() {
  const t = await getTranslations("landing.how");
  const mocks = await Mocks();
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-6 border-y bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-20 md:px-6 md:py-28">
        <div className="text-center">
          <h2 id="how-title" className="text-3xl font-bold md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">{t("intro")}</p>
        </div>

        <ol className="relative mt-14 space-y-12 md:mt-20 md:space-y-16">
          <span
            aria-hidden="true"
            className="absolute top-5 bottom-5 left-5 w-px bg-linear-to-b from-primary via-primary/60 to-marigold md:left-1/2"
          />
          {STEPS.map((step, i) => {
            const flip = i % 2 === 1;
            return (
              <li key={step} className="relative grid gap-4 pl-16 md:grid-cols-2 md:gap-0 md:pl-0">
                <span className="absolute top-0 left-0 grid size-10 place-items-center rounded-full border-2 border-primary bg-background font-heading font-semibold text-primary md:left-1/2 md:-translate-x-1/2">
                  {i + 1}
                </span>
                <div className={cn("min-w-0 self-center md:px-12", flip ? "md:order-2" : "md:text-right")}>
                  <h3 className="text-xl font-semibold">{t(`${step}.title`)}</h3>
                  <p className="mt-1.5 text-muted-foreground">{t(`${step}.body`)}</p>
                </div>
                <div aria-hidden="true" className={cn("min-w-0 md:px-12", flip && "md:order-1")}>
                  <div className={cn("max-w-sm", !flip && "md:ml-0", flip && "md:ml-auto")}>{mocks[step]}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <h3 className="sr-only">{t("trust.title")}</h3>
        <ul className="mt-20 grid gap-8 sm:grid-cols-3">
          {TRUST.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">{t(`trust.${key}.title`)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(`trust.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
