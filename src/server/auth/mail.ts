import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";
import { text } from "@/server/step-text";
import type { Locale } from "@/i18n/request";

/**
 * The sign-in email. Sending happens after the request has answered: an SMTP server can
 * take seconds, and the seller should see "Check your inbox" at once. Without SMTP in
 * development the link goes to the server console instead (the sign-in page says so).
 */

const g = globalThis as { __listsnapMailer?: Transporter };

function mailer(): Transporter | null {
  const smtp = env().smtp;
  if (!smtp) return null;
  // one transport across dev reloads, so a reload doesn't open another SMTP pool
  g.__listsnapMailer ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // 465 speaks TLS from the start; other ports upgrade with STARTTLS
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    pool: true,
  });
  return g.__listsnapMailer;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(url: string, lang: Locale) {
  const t = (key: string) => text(lang, `mail.${key}`);
  const href = escapeHtml(url);
  // inline styles and a table: mail clients drop <style> blocks and most layout CSS
  const html = `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:18px;font-weight:600">ListSnap</p>
<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(t("heading"))}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(t("body"))}</p>
<a href="${href}" style="display:inline-block;padding:12px 24px;background:#1c1917;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(t("button"))}</a>
<p style="margin:24px 0 4px;font-size:13px;color:#57534e">${escapeHtml(t("fallback"))}</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${href}" style="color:#57534e">${href}</a></p>
<p style="margin:0;font-size:13px;color:#78716c">${escapeHtml(t("ignore"))}</p>
</td></tr>
</table>
</body>
</html>`;
  const plain = [t("heading"), "", t("body"), "", url, "", t("ignore")].join("\n");
  return { subject: t("subject"), html, text: plain };
}

/** Queues the sign-in email; failures are logged, never thrown into the sign-in request. */
export function sendMagicLinkMail(to: string, url: string, lang: Locale): void {
  const transport = mailer();
  if (!transport) {
    if (env().prod) console.error("[mail] SMTP is not configured; the sign-in link was not sent.");
    else console.log(`[mail] sign-in link for ${to}:\n${url}`);
    return;
  }
  const mail = render(url, lang);
  // the address stays out of the log: it is personal data
  transport
    .sendMail({ from: env().smtp!.from, to, ...mail })
    .catch((err: unknown) => console.error("[mail] sending the sign-in link failed:", err));
}
