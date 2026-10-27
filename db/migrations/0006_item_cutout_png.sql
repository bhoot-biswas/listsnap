-- A transparent PNG cutout per item, made from SAM's mask. cutout_media_id keeps the
-- white 1:1 main image; studio scenes composite the PNG, so the product sits on the
-- generated background instead of on a white square.

ALTER TABLE `items` ADD COLUMN IF NOT EXISTS `cutout_png_media_id` VARCHAR(36) NULL AFTER `cutout_media_id`;
