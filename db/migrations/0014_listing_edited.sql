-- When the seller last changed what goes to the store (text, price, stock, photos,
-- colours). Compared with sent_at, it tells Review the store draft is out of date;
-- updated_at can't, since status changes and the pipeline move it too.

ALTER TABLE `listings` ADD COLUMN IF NOT EXISTS `edited_at` TIMESTAMP(3) NULL AFTER `sent_at`;
