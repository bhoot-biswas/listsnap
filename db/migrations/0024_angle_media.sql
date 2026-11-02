-- A seller's other photos of the same product, from different angles: copies of the
-- originals after the first, kept with the listing so Review and the store show them.

ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM(
    'original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand',
    'look_eid', 'look_boishakh', 'look_minimal', 'look_outdoor', 'look_wedding', 'reel', 'voice', 'video',
    'angle'
  ) NOT NULL;
