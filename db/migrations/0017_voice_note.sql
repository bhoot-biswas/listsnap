-- A voice note the seller records with the photo: price, sizes, stock, fabric, said aloud.
-- It is media like the photo (a mono WAV), and its job runs one more step, listen.

ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM(
    'original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand',
    'look_eid', 'look_boishakh', 'look_minimal', 'look_outdoor', 'look_wedding', 'reel', 'voice'
  ) NOT NULL;

ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `voice_media_id` VARCHAR(36) NULL AFTER `camera_angle`;
