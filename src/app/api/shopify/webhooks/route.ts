import { disconnectShopifyStore, firstWebhookDelivery, forgetShopifyStore } from "@/server/db/connections";
import { verifyWebhookHmac } from "@/server/providers/shopify/oauth";
import { appSecret } from "@/server/stores/shopify-connect";
import { shopBaseUrl } from "@/server/stores/shopify-store";
import { SHOP_DOMAIN } from "@/lib/shopify-connection";

/**
 * Shopify's webhooks: the app was removed from a store, and the privacy requests every
 * App Store app must answer. The signature is checked on the raw body before anything
 * else, and the answer comes fast: Shopify waits five seconds at most.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), appSecret()))
    return new Response(null, { status: 401 });
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const id = request.headers.get("x-shopify-webhook-id") ?? "";
  if (!SHOP_DOMAIN.test(shop) || !id) return new Response(null, { status: 400 });
  if (!(await firstWebhookDelivery(id.slice(0, 64), topic.slice(0, 64), shop)))
    return new Response(null, { status: 200 });

  if (topic === "app/uninstalled") await disconnectShopifyStore(shopBaseUrl(shop));
  else if (topic === "shop/redact") await forgetShopifyStore(shopBaseUrl(shop));
  // customers/data_request and customers/redact: ListSnap keeps no Shopify customer data,
  // so there is nothing to send or delete; the delivery id above is the record of the request
  return new Response(null, { status: 200 });
}
