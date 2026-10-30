-- Posting: one connection holds the seller's Facebook Page and the Instagram business
-- account linked to it, because one Facebook login grants both.
ALTER TABLE `store_connections` MODIFY COLUMN `kind` ENUM('woo', 'instagram', 'meta') NOT NULL;
