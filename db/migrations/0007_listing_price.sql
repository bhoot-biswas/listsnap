-- The seller's price, set on Review. NULL until then, when the middle of Spark's range
-- is suggested instead.

ALTER TABLE `listings` ADD COLUMN IF NOT EXISTS `price_bdt` INT NULL AFTER `stock_qty`;
