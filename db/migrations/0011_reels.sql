-- Reels: a 9:16 video per listing and language, rendered from our own template. Videos
-- are media like photos, and they have their own daily count beside AI photos.
ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM(
    'original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand',
    'look_eid', 'look_boishakh', 'look_minimal', 'look_outdoor', 'look_wedding', 'reel'
  ) NOT NULL;

ALTER TABLE `usage_daily` ADD COLUMN `reels` INT NOT NULL DEFAULT 0 AFTER `images`;
