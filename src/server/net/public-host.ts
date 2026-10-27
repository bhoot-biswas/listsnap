import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Store addresses are typed by sellers and then fetched by our server, so in
 * production they must point at the public internet: never at localhost, the
 * hosting provider's private network or a cloud metadata address.
 */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** True when every address the host resolves to is public. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(localhost|local|internal)$/i.test(host)) return false;
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}
