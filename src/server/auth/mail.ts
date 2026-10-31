import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";

/**
 * Sign-in emails through Hostinger SMTP, in both languages because the reader may use
 * either and reads the email after the page is gone: the one they asked in comes first.
 *
 * Sends are not awaited (Better Auth's advice), so a link request takes the same time
 * whether or not the address has an account. Without SMTP in development the link is
 * printed to the server console; in production the email option is hidden instead
 * (signInOptions), so no real user's link is ever silently dropped.
 * Adapted from SOHOZ TOOLS (README → pre-existing code).
 */
const g = globalThis as unknown as { __listsnapMail?: Transporter };

function transport(): Transporter | null {
  const { smtp } = env();
  if (!smtp) return null;
  g.__listsnapMail ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465, // 465 is implicit TLS, 587 upgrades with STARTTLS
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return g.__listsnapMail;
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function queueMail(mail: Mail): void {
  const t = transport();
  const { smtp, prod } = env();
  if (!t || !smtp) {
    if (!prod) console.info(`\n[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    else console.error(`[mail] SMTP is not configured; "${mail.subject}" was not sent`);
    return;
  }
  void t
    .sendMail({ from: smtp.from, ...mail })
    .catch((err: unknown) =>
      console.error(`[mail] could not send "${mail.subject}":`, err instanceof Error ? err.message : err),
    );
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY = {
  bn: {
    body: "ListSnap-এ ঢুকতে নিচের বোতামে চাপ দিন। লিংকটি ১৫ মিনিট কাজ করবে, একবারই।",
    button: "ListSnap-এ ঢুকুন",
    footer: "আপনি চেয়ে না থাকলে এই ইমেইলটি উপেক্ষা করুন।",
  },
  en: {
    body: "Use the button below to sign in to ListSnap. The link works once, for 15 minutes.",
    button: "Sign in to ListSnap",
    footer: "If you didn't ask for this, you can ignore this email.",
  },
};

export function sendMagicLinkMail(to: string, url: string, lang: "en" | "bn"): void {
  const [first, second] = lang === "bn" ? (["bn", "en"] as const) : (["en", "bn"] as const);
  const link = escape(url);
  const block = (c: (typeof COPY)["en"], lang: string) => `
    <div lang="${lang}" style="margin:0 0 28px">
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escape(c.body)}</p>
      <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#0E7357;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escape(c.button)}</a></p>
      <p style="margin:0;font-size:13px;color:#5A6961;line-height:1.5">${escape(c.footer)}</p>
    </div>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F8F6;font-family:'Hind Siliguri',Arial,sans-serif;color:#14201A">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #DCE2DA;border-radius:12px;padding:28px">
    <p style="margin:0 0 24px;font-weight:700;font-size:18px;color:#0E7357">ListSnap</p>
    ${block(COPY[first], first)}
    <hr style="border:none;border-top:1px solid #DCE2DA;margin:0 0 28px">
    ${block(COPY[second], second)}
    <p style="margin:24px 0 0;font-size:12px;color:#5A6961;word-break:break-all">${link}</p>
  </div></body></html>`;
  const text = [
    COPY[first].body,
    "",
    url,
    "",
    COPY[first].footer,
    "",
    "────────",
    "",
    COPY[second].body,
    "",
    url,
    "",
    COPY[second].footer,
  ].join("\n");
  const subjects = { en: "Your ListSnap sign-in link", bn: "ListSnap-এ ঢোকার লিংক" };
  queueMail({ to, subject: `${subjects[first]} · ${subjects[second]}`, text, html });
}
