import { optionalViewer } from "@/server/auth/session";
import { ClosingCta } from "./_components/closing-cta";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { Outcomes } from "./_components/outcomes";
import { PublicHeader } from "./_components/public-header";
import { SiteFooter } from "./_components/site-footer";

/**
 * S0 Landing: four sections and a footer. The hero band is dark in both themes
 * (the `dark` class switches its tokens) so the white studio photo stands out.
 */
export default async function LandingPage() {
  const signedIn = !!(await optionalViewer());
  return (
    <>
      <div className="dark bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6">
          <PublicHeader />
        </div>
      </div>
      <main>
        <div className="dark relative isolate overflow-hidden bg-background text-foreground">
          <Hero signedIn={signedIn} />
        </div>
        <Outcomes />
        <HowItWorks />
        <ClosingCta signedIn={signedIn} />
      </main>
      <SiteFooter />
    </>
  );
}
