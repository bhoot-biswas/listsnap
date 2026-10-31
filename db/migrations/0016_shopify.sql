-- Shopify, next to WooCommerce. A shop can connect both, so a listing can be in more than
-- one store: which product it is in each store moves from listings.wc_product_id to its
-- own table, and each store gets its own save step (store:woo, store:shopify).
-- listings.wc_product_id stays for now so an older build still reads it; a later
-- migration drops it.

ALTER TABLE `store_connections` MODIFY COLUMN `kind` ENUM('woo', 'instagram', 'meta', 'shopify') NOT NULL;

CREATE TABLE IF NOT EXISTS `listing_store_products` (
  `listing_id` VARCHAR(36) NOT NULL,
  `kind` ENUM('woo', 'shopify') NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  -- WooCommerce's product id, or Shopify's product GID
  `product_ref` VARCHAR(64) NOT NULL,
  `saved_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`listing_id`, `kind`),
  KEY `listing_store_products_ws_idx` (`workspace_id`, `kind`),
  CONSTRAINT `listing_store_products_listing_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `listing_store_products_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `listing_store_products` (`listing_id`, `kind`, `workspace_id`, `product_ref`, `saved_at`)
  SELECT `id`, 'woo', `workspace_id`, CAST(`wc_product_id` AS CHAR), COALESCE(`sent_at`, `updated_at`)
    FROM `listings` WHERE `wc_product_id` IS NOT NULL;

UPDATE `job_steps` SET `step` = 'store:woo' WHERE `step` = 'store';

-- Shopify retries a webhook it thinks failed; each delivery id is handled once.
CREATE TABLE IF NOT EXISTS `shopify_webhooks` (
  `webhook_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `topic` VARCHAR(64) NOT NULL,
  `shop` VARCHAR(255) NOT NULL,
  `received_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
