-- "I posted it" on Review's Marketplace card. ListSnap can't post to Marketplace (Meta has
-- no API for it), so these record what the seller says they did, and the link if they gave one.

ALTER TABLE `listings` ADD COLUMN IF NOT EXISTS `marketplace_posted_at` TIMESTAMP(3) NULL AFTER `archived_at`;
ALTER TABLE `listings` ADD COLUMN IF NOT EXISTS `marketplace_url` VARCHAR(500) NULL AFTER `marketplace_posted_at`;
