import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * Store credentials (WooCommerce keys, Instagram tokens) at rest: AES-256-GCM with a
 * random 12-byte IV per value. Stored as "v1.<iv>.<tag>.<ciphertext>" in base64url, so
 * a later key rotation can add v2 without guessing which format a row uses.
 */
const VERSION = "v1";

function key(raw = env().credentialsKey): Buffer {
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CREDENTIALS_KEY must be 32 bytes, base64 (openssl rand -base64 32).");
  return k;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(stored: string, rawKey?: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** For the UI and logs: the last 4 characters only. */
export const maskSecret = (s: string): string => (s.length <= 4 ? "••••" : `••••${s.slice(-4)}`);
