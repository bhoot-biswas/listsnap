"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Mail, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/lib/auth-client";

const RESEND_SECONDS = 45;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.8A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
      />
    </svg>
  );
}

export function SignInForm(props: {
  google: boolean;
  email: boolean;
  devMail: boolean;
  demoExpired: boolean;
  error: string | null;
}) {
  const t = useTranslations("signIn");
  const tDemo = useTranslations("demo");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<"google" | "email" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(
    props.error === "expired" || props.error === "EXPIRED_TOKEN" || props.error === "INVALID_TOKEN"
      ? t("errorExpired")
      : props.error === "access_denied"
        ? t("errorCancelled")
        : props.error
          ? t("errorGeneric")
          : null,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const google = async () => {
    setBusy("google");
    setError(null);
    const r = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in",
    });
    if (r.error) {
      setError(t("errorGeneric"));
      setBusy(null);
    }
  };

  const sendLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError(t("errorEmail"));
    setBusy("email");
    setError(null);
    const r = await authClient.signIn.magicLink({
      email: address,
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in?error=expired",
    });
    setBusy(null);
    if (r.error) return setError(t("errorGeneric"));
    setSentTo(address);
    setCooldown(RESEND_SECONDS);
  };

  const demo = async () => {
    setBusy("demo");
    setError(null);
    const r = await authClient.signIn.anonymous();
    // already in a demo shop: just go back to it
    if (r.error && r.error.status !== 400) {
      setError(t("errorGeneric"));
      setBusy(null);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {props.demoExpired && (
        <Alert>
          <AlertDescription>{tDemo("expired")}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {props.google && (
        <Button size="lg" variant="outline" className="w-full" onClick={google} disabled={!!busy}>
          {busy === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
          {t("google")}
        </Button>
      )}

      {props.google && props.email && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          {t("or")}
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {props.email &&
        (sentTo ? (
          <div className="space-y-3 rounded-xl border bg-card p-4" aria-live="polite">
            <p className="flex items-center gap-2 font-medium">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              {t("sentTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{t("sentBody", { email: sentTo })}</p>
            {props.devMail && <p className="text-xs text-muted-foreground">{t("devMailNote")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"

                onClick={() => sendLink()}
                disabled={cooldown > 0 || !!busy}
              >
                {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
                {t("differentEmail")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="h-11"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!!busy}>
              {busy === "email" && <Loader2 className="animate-spin" />}
              {busy === "email" ? t("sending") : t("sendLink")}
            </Button>
          </form>
        ))}

      <div className="space-y-2 border-t pt-6">
        <p className="text-sm text-muted-foreground">{t("justLooking")}</p>
        <Button size="lg" variant="secondary" className="w-full" onClick={demo} disabled={!!busy}>
          {busy === "demo" ? <Loader2 className="animate-spin" /> : <Store />}
          {busy === "demo" ? t("startingDemo") : t("tryDemo")}
        </Button>
      </div>
    </div>
  );
}
