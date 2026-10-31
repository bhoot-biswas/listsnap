import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";

/**
 * Store addresses are typed by sellers and then fetched by our server, so in
 * production they must point at the public internet: never at localhost, the
 * hosting provider's private network or a cloud metadata address.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  // NAT64 and 6to4 carry an IPv4 address inside, which may be a private one
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["100::", 64],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** Anything that isn't a plain public address counts as private, including text that isn't an address. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  // BlockList matches an IPv4-mapped address (::ffff:7f00:1) against the IPv4 rules too
  if (family === 6) return blocked.check(ip, "ipv6");
  return true;
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

/**
 * isPublicHost checks a name once, but the connection resolves it again, and a name can
 * answer with a public address first and a private one the second time. This lookup runs
 * for the connection itself, so the address that is checked is the one that is used.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      const refused = Object.assign(new Error(`${hostname} resolves to a private address`), { code: "EPRIVATE" });
      return callback(refused, "", 0);
    }
    if (options.all) return (callback as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

let agent: Agent | null = null;

/** A connection pool that only ever connects to public addresses. */
export function publicOnlyAgent(): Agent {
  return (agent ??= new Agent({ connect: { lookup: publicLookup } }));
}
